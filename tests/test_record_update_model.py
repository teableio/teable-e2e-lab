"""The two properties the update case cannot survive losing.

An update case proves something only if the rows started somewhere else and the
payload is capable of moving every cell. Both are properties of pure functions,
so both are pinned here rather than trusted to review.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from framework.runners.record_create import FieldSpec, expected_cell, expected_row
from framework.runners.record_update import RecordUpdateConfig, update_payload_row

FIELDS = [
    FieldSpec(name="Title", type="singleLineText"),
    FieldSpec(name="Description", type="longText"),
    FieldSpec(name="Score", type="number"),
    FieldSpec(name="Active", type="checkbox"),
]


def test_revision_1_is_exactly_what_the_create_case_already_asserts() -> None:
    # Adding the revision parameter must not have moved a single value the
    # create case was already pinned to.
    assert expected_cell(FIELDS[0], 3, 1) == "Title-3"
    assert expected_cell(FIELDS[1], 3, 1) == "Description row 3\nline two"
    assert expected_cell(FIELDS[2], 3, 1) == 3.0
    assert expected_cell(FIELDS[3], 4, 1) is True
    assert expected_cell(FIELDS[3], 3, 1) is None
    for field in FIELDS:
        assert expected_cell(field, 7) == expected_cell(field, 7, 1)


def test_no_cell_survives_a_revision_bump() -> None:
    """The load-bearing property: nothing stays the same across revisions.

    If any (field, row) agreed between the seed and the target revision, a row
    the update never reached would still pass on that cell — and the checkbox
    column, whose parity has to invert, would hide half the rows.
    """
    for row in range(1, 101):
        for field in FIELDS:
            before = expected_cell(field, row, 1)
            after = expected_cell(field, row, 2)
            assert before != after, f"{field.name} row {row} is {before!r} at both revisions"


def test_a_revision_is_still_a_pure_function_of_the_row() -> None:
    assert expected_cell(FIELDS[0], 7, 2) == expected_cell(FIELDS[0], 7, 2)
    assert expected_cell(FIELDS[0], 7, 2) != expected_cell(FIELDS[0], 8, 2)


def test_the_checkbox_parity_inverts() -> None:
    assert expected_cell(FIELDS[3], 4, 1) is True and expected_cell(FIELDS[3], 4, 2) is None
    assert expected_cell(FIELDS[3], 3, 1) is None and expected_cell(FIELDS[3], 3, 2) is True


def test_an_update_payload_names_the_cells_it_has_to_clear() -> None:
    # The asymmetry that makes an update payload different from a create one:
    # a field left out of a PATCH keeps its previous value, so a box going from
    # checked to unchecked must be named with an explicit null.
    payload = update_payload_row(FIELDS, 4, 2)
    assert payload["Active"] is None
    assert set(payload) == {"Title", "Description", "Score", "Active"}

    # The read-back expectation for that same row omits it entirely — write a
    # null, read back nothing.
    assert "Active" not in expected_row(FIELDS, 4, 2)


def test_every_row_names_every_field_in_an_update() -> None:
    for row in (1, 2, 99, 100):
        assert set(update_payload_row(FIELDS, row, 2)) == {f.name for f in FIELDS}


def test_a_config_that_rewrites_the_same_values_is_rejected() -> None:
    # Seed and target revision being equal would make the case green while
    # proving nothing at all, which is worse than having no case.
    with pytest.raises(ValidationError, match="without proving anything"):
        RecordUpdateConfig(
            table_name_prefix="x",
            fields=FIELDS,
            record_count=10,
            seed_revision=2,
            target_revision=2,
        )
