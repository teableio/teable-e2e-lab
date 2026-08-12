"""Bulk record creation, verified row by row through the public read path.

This runner is where the borrowed discipline actually shows up:

- **Deterministic data.** Every cell value is a pure function of its row number,
  its field spec, and a revision number, so `verify` recomputes the expected
  value locally instead of trusting a snapshot. Nothing has to be recorded
  between runs, and a re-run compares byte-for-byte with the last one.
- **Seed readiness.** `seed` does not hand back a fixture it has not proved is
  empty. A table that silently arrives with Teable's three default rows would
  turn the row-count assertion into a lie in the most confusing possible way.
- **Full scan.** Sampling three rows cannot catch "997 of 1000 landed". The scan
  reads every row through the same endpoint a user's grid would.

The value formula and the batched create loop live here rather than in a runner
of their own because this is where they are defined and tested. Sibling record
runners import them, so a case that writes rows and a case that rewrites them
are provably talking about the same 100 rows.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from framework.client import TeableClient
from framework.types import RunContext, Runner
from framework.verify import scan_records

FieldType = Literal["singleLineText", "longText", "number", "checkbox"]


class FieldSpec(BaseModel):
    name: str
    type: FieldType


class RecordCreateConfig(BaseModel):
    table_name_prefix: str
    fields: list[FieldSpec]
    record_count: int = Field(gt=0)
    # Teable accepts at most 1000 records per create call.
    batch_size: int = Field(default=1000, gt=0, le=1000)
    # Rows whose full field set is spelled out in the artifact, for eyeballing.
    sample_rows: list[int] = Field(default_factory=lambda: [1])


class Fixture(BaseModel):
    space_id: str
    base_id: str
    table_id: str
    field_ids: dict[str, str]


class Observation(BaseModel):
    created_ids: list[str] = Field(default_factory=list)
    batch_statuses: list[int] = Field(default_factory=list)


def expected_cell(field: FieldSpec, row: int, revision: int = 1) -> Any:
    """The single source of truth for what row N should contain at revision R.

    Used to build the request *and* to check the response, so the two can never
    drift apart. Keep it total and side-effect free.

    `revision` exists so a case can rewrite the same rows and prove the rewrite
    landed. It carries one load-bearing property, pinned by a unit test: for a
    given row, **no two revisions agree on any cell**. A revision that left even
    one cell unchanged would make "this row was never updated" invisible on that
    cell, which is precisely the failure an update case exists to catch.

    Revision 1 is the unsuffixed original, so adding this parameter did not move
    a single value the create case had already asserted.
    """
    suffix = "" if revision == 1 else f"-r{revision}"
    if field.type == "singleLineText":
        return f"{field.name}-{row}{suffix}"
    if field.type == "longText":
        return f"{field.name} row {row}{suffix}\nline two"
    if field.type == "number":
        # Rows are 1-based, so scaling by the revision moves every cell.
        return float(row * revision)
    if field.type == "checkbox":
        # Teable stores an unchecked box as absent rather than false, so the
        # expectation for an unchecked row is "no value", not "False". The
        # parity flips with each revision: at revision 1 the even rows are
        # checked, at revision 2 the odd ones are.
        return True if (row + revision) % 2 == 1 else None
    raise ValueError(f"unsupported field type {field.type!r}")


def expected_row(fields: list[FieldSpec], row: int, revision: int = 1) -> dict[str, Any]:
    """What the read path should hand back for row N — empty cells omitted.

    This is the *read* shape. A create payload happens to share it (an absent
    checkbox means unchecked), but an update payload does not: see
    `record_update.update_payload_row`.
    """
    values = {f.name: expected_cell(f, row, revision) for f in fields}
    return {k: v for k, v in values.items() if v is not None}


def create_rows(
    client: TeableClient,
    table_id: str,
    fields: list[FieldSpec],
    count: int,
    *,
    batch_size: int,
    revision: int = 1,
) -> tuple[list[str], list[int]]:
    """POST `count` deterministic rows in batches; return (ids, statuses).

    Shared with the update runner, whose seed needs exactly these rows. One
    implementation means the rows a rewrite starts from are byte-for-byte the
    rows the create case asserts.

    Stops at the first rejected batch and reports what happened rather than
    raising: the caller decides whether a short write is a product failure to
    verify against, or a fixture that never got built.
    """
    created_ids: list[str] = []
    statuses: list[int] = []
    for start in range(1, count + 1, batch_size):
        end = min(start + batch_size - 1, count)
        payload = {
            "fieldKeyType": "name",
            "records": [
                {"fields": expected_row(fields, row, revision)} for row in range(start, end + 1)
            ],
        }
        response = client.post(f"/api/table/{table_id}/record", json=payload)
        statuses.append(response.status_code)
        if response.status_code >= 400:
            break
        created_ids.extend(record["id"] for record in response.json().get("records", []))
    return created_ids, statuses


class RecordCreateRunner(Runner[RecordCreateConfig, Fixture, Observation]):
    kind = "record-create"

    def seed(self, ctx: RunContext, config: RecordCreateConfig) -> Fixture:
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
        table_body = table.json()
        table_id = table_body["id"]
        field_ids = {f["name"]: f["id"] for f in table_body.get("fields", [])}

        # Seed readiness: prove the fixture is what the execute stage assumes.
        leftover = list(scan_records(client, table_id))
        if leftover:
            raise RuntimeError(
                f"seed table {table_id} arrived with {len(leftover)} pre-existing rows; "
                "the create-table payload did not produce an empty table"
            )

        return Fixture(
            space_id=space_id, base_id=base_id, table_id=table_id, field_ids=field_ids
        )

    def execute(
        self, ctx: RunContext, config: RecordCreateConfig, fixture: Fixture
    ) -> Observation:
        # A rejected batch is recorded, not raised: verify still runs and
        # reports how much of the intended state actually exists.
        created_ids, statuses = create_rows(
            ctx.client,
            fixture.table_id,
            config.fields,
            config.record_count,
            batch_size=config.batch_size,
        )
        return Observation(created_ids=created_ids, batch_statuses=statuses)

    def verify(
        self,
        ctx: RunContext,
        config: RecordCreateConfig,
        fixture: Fixture,
        observation: Observation,
    ) -> None:
        checks = ctx.checks

        all_accepted = all(status < 400 for status in observation.batch_statuses)
        checks.is_true("create.all_batches_accepted", all_accepted)
        checks.equal("create.returned_ids", config.record_count, len(observation.created_ids))

        # The full scan runs even when a batch failed — knowing how many rows
        # actually landed is the most useful fact in a partial-failure report.
        scanned = 0
        mismatched: list[dict[str, Any]] = []
        for row, record in scan_records(ctx.client, fixture.table_id):
            scanned += 1
            expected = expected_row(config.fields, row)
            actual_fields = record.get("fields", {})
            for name, expected_value in expected.items():
                if actual_fields.get(name) != expected_value and len(mismatched) < 10:
                    mismatched.append(
                        {
                            "row": row,
                            "field": name,
                            "expected": expected_value,
                            "actual": actual_fields.get(name),
                        }
                    )

        checks.equal("scan.record_count", config.record_count, scanned)
        checks.equal(
            "scan.cell_values_match",
            [],
            mismatched,
            note="every cell is recomputed from its row number; "
            "at most the first 10 mismatches are listed",
        )

    def cleanup(
        self, ctx: RunContext, config: RecordCreateConfig, fixture: Fixture | None
    ) -> None:
        if fixture is None:
            return
        # Deleting the space removes the base and its tables in one call.
        ctx.client.delete(f"/api/space/{fixture.space_id}")

    def evidence(
        self,
        config: RecordCreateConfig,
        fixture: Fixture | None,
        observation: Observation | None,
    ) -> dict[str, Any]:
        evidence: dict[str, Any] = {
            "record_count": config.record_count,
            "fields": [f.model_dump() for f in config.fields],
            "sample_expected_rows": {
                str(row): expected_row(config.fields, row) for row in config.sample_rows
            },
        }
        if fixture:
            evidence.update(
                space_id=fixture.space_id, base_id=fixture.base_id, table_id=fixture.table_id
            )
        if observation:
            evidence["batch_statuses"] = observation.batch_statuses
            evidence["created_id_count"] = len(observation.created_ids)
        return evidence
