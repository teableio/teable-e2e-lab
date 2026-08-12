"""Bulk record update, verified cell by cell through the public read path.

The failure this runner exists to catch is narrow and nasty: **the update was
accepted and only part of it landed**. It is worth spelling out why the obvious
checks do not catch it, because each of them looks sufficient on its own.

- The status code does not catch it. Teable answers a batch update with 200 and
  a list of the records it actually touched; ids it did not recognise are
  dropped from that list rather than reported as an error. A call that updated
  nothing at all still answers 200.
- Sampling does not catch it. Three sampled rows out of a hundred can easily be
  three of the rows that did land.
- Row counts do not catch it. An update changes no row count, so "still 100
  rows" is true whether one cell changed or none did.

So the verification has to be a full scan comparing **every cell** against a
locally recomputed expectation. That expectation comes from `record_create`'s
value formula at a different revision, which guarantees the property the whole
case rests on: for every row and every field, the value before the update
differs from the value after it. A row the update skipped therefore cannot pass
any cell, and the scan names the row and the field.

One product semantic is load-bearing here and was observed rather than assumed:
a field left out of a PATCH body keeps its previous value, so clearing a cell
means naming it with an explicit null. That makes the update payload shape
genuinely different from the create payload shape — see `update_payload_row`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from framework.runners.record_create import (
    FieldSpec,
    create_rows,
    expected_cell,
    expected_row,
)
from framework.types import RunContext, Runner
from framework.verify import scan_records

# How many mismatching cells or ids a check spells out. Enough to see the shape
# of the failure, not so many that a wholly-failed update buries the artifact.
MAX_REPORTED = 10


class RecordUpdateConfig(BaseModel):
    table_name_prefix: str
    fields: list[FieldSpec]
    record_count: int = Field(gt=0)
    # The revision the rows are seeded at, and the one they are rewritten to.
    # They must differ, or the case would rewrite every row with the value it
    # already had and prove nothing while staying green.
    seed_revision: int = Field(default=1, gt=0)
    target_revision: int = Field(default=2, gt=0)
    # Teable accepts at most 1000 records per create call.
    create_batch_size: int = Field(default=1000, gt=0, le=1000)
    # The update endpoint was observed accepting 1001 records without complaint,
    # so this bound is the suite's own rather than the server's. Setting it
    # below record_count is what makes a case cover a multi-call update, which
    # is how "only part of it landed" happens in the first place.
    update_batch_size: int = Field(default=1000, gt=0, le=1000)
    # Rows whose before/after field sets are spelled out in the artifact.
    sample_rows: list[int] = Field(default_factory=lambda: [1])

    @model_validator(mode="after")
    def _revisions_must_differ(self) -> RecordUpdateConfig:
        if self.seed_revision == self.target_revision:
            raise ValueError(
                f"seed_revision and target_revision are both {self.seed_revision}; "
                "the update would write back the value each row already had, and "
                "the case would pass without proving anything"
            )
        return self


class Fixture(BaseModel):
    space_id: str
    base_id: str
    table_id: str
    # Record ids in scan order, so row N of the expectations and row N of the
    # update payload are provably the same record.
    record_ids: list[str]


class Observation(BaseModel):
    batch_statuses: list[int] = Field(default_factory=list)
    # Ids echoed back by the update responses. Shorter than the request means
    # the server quietly skipped rows — the whole point of checking it.
    echoed_ids: list[str] = Field(default_factory=list)


def update_payload_row(
    fields: list[FieldSpec], row: int, revision: int
) -> dict[str, Any]:
    """The `fields` body that moves row N to `revision`.

    Every field is named, including the ones that must end up empty. This is
    where an update differs from a create: `expected_row` drops empty cells,
    which is correct for a create (an absent checkbox means unchecked) and
    silently wrong for an update, where an omitted field is left untouched. A
    checkbox going from checked to unchecked has to be cleared by name.

    The read path still reports a cleared cell as absent, so the expectation for
    the same row stays `expected_row` — write an explicit null, read back
    nothing. Both halves of that asymmetry were observed on a live target.
    """
    return {f.name: expected_cell(f, row, revision) for f in fields}


class RecordUpdateRunner(Runner[RecordUpdateConfig, Fixture, Observation]):
    kind = "record-update"

    def seed(self, ctx: RunContext, config: RecordUpdateConfig) -> Fixture:
        client = ctx.client
        suffix = ctx.run_id[-8:]

        space = client.post("/api/space", json={"name": f"{config.table_name_prefix}-{suffix}"})
        if space.status_code >= 400:
            raise RuntimeError(f"create space failed: HTTP {space.status_code} {space.text[:300]}")
        space_id = space.json()["id"]

        base = client.post(
            "/api/base", json={"spaceId": space_id, "name": f"{config.table_name_prefix}-{suffix}"}
        )
        if base.status_code >= 400:
            raise RuntimeError(f"create base failed: HTTP {base.status_code} {base.text[:300]}")
        base_id = base.json()["id"]

        table = client.post(
            f"/api/base/{base_id}/table",
            json={
                "name": f"{config.table_name_prefix}-{suffix}",
                "fields": [f.model_dump() for f in config.fields],
                # Explicitly empty: without this Teable seeds three blank rows,
                # which would silently corrupt every row-count expectation.
                "records": [],
            },
        )
        if table.status_code >= 400:
            raise RuntimeError(f"create table failed: HTTP {table.status_code} {table.text[:300]}")
        table_id = table.json()["id"]

        leftover = list(scan_records(client, table_id))
        if leftover:
            raise RuntimeError(
                f"seed table {table_id} arrived with {len(leftover)} pre-existing rows; "
                "the create-table payload did not produce an empty table"
            )

        _, statuses = create_rows(
            client,
            table_id,
            config.fields,
            config.record_count,
            batch_size=config.create_batch_size,
            revision=config.seed_revision,
        )
        if any(status >= 400 for status in statuses):
            raise RuntimeError(f"seeding rows failed: create returned {statuses}")

        # Seed readiness. Everything this case concludes rests on the rows
        # having started at `seed_revision`: if they were already at the target
        # values, a completely broken update would still scan clean. So the
        # starting state is proved, not assumed — and proved through the same
        # read path the verification uses, in the same order, which is also how
        # the row -> id mapping is built.
        record_ids: list[str] = []
        for row, record in scan_records(client, table_id):
            record_ids.append(record["id"])
            expected = expected_row(config.fields, row, config.seed_revision)
            if record.get("fields", {}) != expected:
                raise RuntimeError(
                    f"seed row {row} is not at revision {config.seed_revision}: "
                    f"expected {expected!r}, got {record.get('fields')!r}"
                )
        if len(record_ids) != config.record_count:
            raise RuntimeError(
                f"seed produced {len(record_ids)} rows, expected {config.record_count}; "
                "the update would be measured against a table that was never built"
            )

        return Fixture(
            space_id=space_id, base_id=base_id, table_id=table_id, record_ids=record_ids
        )

    def execute(
        self, ctx: RunContext, config: RecordUpdateConfig, fixture: Fixture
    ) -> Observation:
        observation = Observation()
        for start in range(1, config.record_count + 1, config.update_batch_size):
            end = min(start + config.update_batch_size - 1, config.record_count)
            payload = {
                "fieldKeyType": "name",
                "records": [
                    {
                        "id": fixture.record_ids[row - 1],
                        "fields": update_payload_row(
                            config.fields, row, config.target_revision
                        ),
                    }
                    for row in range(start, end + 1)
                ],
            }
            response = ctx.client.patch(
                f"/api/table/{fixture.table_id}/record", json=payload
            )
            observation.batch_statuses.append(response.status_code)
            if response.status_code >= 400:
                # Recorded, not raised: verify still runs and reports how much
                # of the intended state actually exists.
                break
            # Unlike create, this endpoint answers with a bare array rather than
            # a {"records": [...]} envelope.
            body = response.json()
            records = body if isinstance(body, list) else body.get("records", [])
            observation.echoed_ids.extend(record["id"] for record in records)
        return observation

    def verify(
        self,
        ctx: RunContext,
        config: RecordUpdateConfig,
        fixture: Fixture,
        observation: Observation,
    ) -> None:
        checks = ctx.checks

        all_accepted = all(status < 400 for status in observation.batch_statuses)
        checks.is_true("update.all_batches_accepted", all_accepted)
        # The response layer's real signal. An id the server does not recognise
        # is dropped from the echoed list instead of raising an error, so a
        # short list is the earliest visible sign that rows were skipped.
        checks.equal(
            "update.echoed_record_count",
            config.record_count,
            len(observation.echoed_ids),
            note="the update endpoint answers 200 while silently omitting rows "
            "it did not touch, so the echoed count is asserted rather than the status alone",
        )

        # The full scan runs even when a batch failed — knowing how many rows
        # actually moved is the most useful fact in a partial-failure report.
        scanned = 0
        mismatched: list[dict[str, Any]] = []
        id_drift: list[dict[str, Any]] = []
        rows_at_seed_revision = 0
        configured = {f.name for f in config.fields}
        for row, record in scan_records(ctx.client, fixture.table_id):
            scanned += 1
            # Projected onto the configured fields: a field this case never
            # wrote must not decide any comparison below. Without this, a target
            # that returns one extra key would make the "still at the seed
            # revision" count permanently zero — a check that cannot fail.
            actual_fields = {
                k: v for k, v in record.get("fields", {}).items() if k in configured
            }

            expected = expected_row(config.fields, row, config.target_revision)
            for name, expected_value in expected.items():
                if actual_fields.get(name) != expected_value and len(mismatched) < MAX_REPORTED:
                    mismatched.append(
                        {
                            "row": row,
                            "field": name,
                            "expected": expected_value,
                            "actual": actual_fields.get(name),
                        }
                    )
            # A cell the update should have cleared but did not is a mismatch
            # the loop above cannot see, because the expectation has no key for
            # it. This is the checkbox-parity case: an omitted field keeps its
            # old value, so a payload bug shows up here and nowhere else.
            for field in config.fields:
                stale = field.name not in expected and field.name in actual_fields
                if stale and len(mismatched) < MAX_REPORTED:
                    mismatched.append(
                        {
                            "row": row,
                            "field": field.name,
                            "expected": "<absent>",
                            "actual": actual_fields[field.name],
                        }
                    )

            if actual_fields == expected_row(config.fields, row, config.seed_revision):
                rows_at_seed_revision += 1

            seeded_id = (
                fixture.record_ids[row - 1] if row <= len(fixture.record_ids) else None
            )
            if record["id"] != seeded_id and len(id_drift) < MAX_REPORTED:
                id_drift.append(
                    {"row": row, "expected": seeded_id, "actual": record["id"]}
                )

        checks.equal("scan.record_count", config.record_count, scanned)
        checks.equal(
            "scan.record_ids_unchanged",
            [],
            id_drift,
            note="an update must rewrite the rows in place; new ids or a reordered "
            "scan would also invalidate the row-number-to-value mapping",
        )
        checks.equal(
            "scan.cell_values_match",
            [],
            mismatched,
            note=f"every cell is recomputed at revision {config.target_revision} from its "
            f"row number; at most the first {MAX_REPORTED} mismatches are listed",
        )
        # Names the failure this case exists for, and answers the question the
        # capped mismatch list cannot: "3 rows wrong" and "100 rows wrong" both
        # show ten entries above, and only this tells them apart.
        checks.equal(
            "scan.rows_left_at_seed_revision",
            0,
            rows_at_seed_revision,
            note=f"rows still holding every revision-{config.seed_revision} value, "
            "i.e. rows the update never reached",
        )

    def cleanup(
        self, ctx: RunContext, config: RecordUpdateConfig, fixture: Fixture | None
    ) -> None:
        if fixture is None:
            return
        # Deleting the space removes the base and its tables in one call.
        ctx.client.delete(f"/api/space/{fixture.space_id}")

    def evidence(
        self,
        config: RecordUpdateConfig,
        fixture: Fixture | None,
        observation: Observation | None,
    ) -> dict[str, Any]:
        evidence: dict[str, Any] = {
            "record_count": config.record_count,
            "fields": [f.model_dump() for f in config.fields],
            "seed_revision": config.seed_revision,
            "target_revision": config.target_revision,
            "update_batch_size": config.update_batch_size,
            "update_batches_planned": (
                (config.record_count + config.update_batch_size - 1) // config.update_batch_size
            ),
            "sample_rows_before": {
                str(row): expected_row(config.fields, row, config.seed_revision)
                for row in config.sample_rows
            },
            "sample_rows_after": {
                str(row): expected_row(config.fields, row, config.target_revision)
                for row in config.sample_rows
            },
            # The payload shape, kept because it is where the explicit null that
            # clears a cell is visible — the read-back expectation above has no
            # key for it.
            "sample_update_payloads": {
                str(row): update_payload_row(config.fields, row, config.target_revision)
                for row in config.sample_rows
            },
        }
        if fixture:
            evidence.update(
                space_id=fixture.space_id,
                base_id=fixture.base_id,
                table_id=fixture.table_id,
                seeded_id_count=len(fixture.record_ids),
            )
        if observation:
            evidence["batch_statuses"] = observation.batch_statuses
            evidence["echoed_id_count"] = len(observation.echoed_ids)
        return evidence
