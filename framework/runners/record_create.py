"""Bulk record creation, verified row by row through the public read path.

This runner is where the borrowed discipline actually shows up:

- **Deterministic data.** Every cell value is a pure function of its row number
  and the field spec, so `verify` recomputes the expected value locally instead
  of trusting a snapshot. Nothing has to be recorded between runs, and a
  re-run compares byte-for-byte with the last one.
- **Seed readiness.** `seed` does not hand back a fixture it has not proved is
  empty. A table that silently arrives with Teable's three default rows would
  turn the row-count assertion into a lie in the most confusing possible way.
- **Full scan.** Sampling three rows cannot catch "997 of 1000 landed". The scan
  reads every row through the same endpoint a user's grid would.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

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


def expected_cell(field: FieldSpec, row: int) -> Any:
    """The single source of truth for what row N should contain.

    Used to build the request *and* to check the response, so the two can never
    drift apart. Keep it total and side-effect free.
    """
    if field.type == "singleLineText":
        return f"{field.name}-{row}"
    if field.type == "longText":
        return f"{field.name} row {row}\nline two"
    if field.type == "number":
        return float(row)
    if field.type == "checkbox":
        # Teable stores an unchecked box as absent rather than false, so the
        # expectation for odd rows is "no value", not "False".
        return True if row % 2 == 0 else None
    raise ValueError(f"unsupported field type {field.type!r}")


def expected_row(fields: list[FieldSpec], row: int) -> dict[str, Any]:
    values = {f.name: expected_cell(f, row) for f in fields}
    return {k: v for k, v in values.items() if v is not None}


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
        observation = Observation()
        for start in range(1, config.record_count + 1, config.batch_size):
            end = min(start + config.batch_size - 1, config.record_count)
            payload = {
                "fieldKeyType": "name",
                "records": [
                    {"fields": expected_row(config.fields, row)} for row in range(start, end + 1)
                ],
            }
            response = ctx.client.post(
                f"/api/table/{fixture.table_id}/record", json=payload
            )
            observation.batch_statuses.append(response.status_code)
            if response.status_code >= 400:
                # Recorded, not raised: verify still runs and reports how much
                # of the intended state actually exists.
                break
            observation.created_ids.extend(
                record["id"] for record in response.json().get("records", [])
            )
        return observation

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
