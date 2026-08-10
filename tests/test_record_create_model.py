"""Determinism is the property the whole verify stage rests on.

`expected_cell` builds the request *and* checks the response. If it were ever
non-deterministic, every case using this runner would pass while proving
nothing — so it is pinned here rather than trusted.
"""

from __future__ import annotations

from framework.runners.record_create import FieldSpec, expected_cell, expected_row

FIELDS = [
    FieldSpec(name="Title", type="singleLineText"),
    FieldSpec(name="Description", type="longText"),
    FieldSpec(name="Score", type="number"),
    FieldSpec(name="Active", type="checkbox"),
]


def test_values_depend_only_on_the_row_number() -> None:
    assert expected_cell(FIELDS[0], 7) == expected_cell(FIELDS[0], 7)
    assert expected_cell(FIELDS[0], 7) != expected_cell(FIELDS[0], 8)


def test_each_type_has_a_stable_shape() -> None:
    assert expected_cell(FIELDS[0], 3) == "Title-3"
    assert expected_cell(FIELDS[1], 3) == "Description row 3\nline two"
    assert expected_cell(FIELDS[2], 3) == 3.0
    assert expected_cell(FIELDS[3], 4) is True


def test_an_unchecked_box_is_absent_not_false() -> None:
    # Teable stores an unchecked box by omitting the field. Expecting `False`
    # here would fail against a correct product.
    assert expected_cell(FIELDS[3], 3) is None
    assert "Active" not in expected_row(FIELDS, 3)
    assert expected_row(FIELDS, 4)["Active"] is True


def test_a_row_carries_every_field_that_has_a_value() -> None:
    row = expected_row(FIELDS, 2)
    assert set(row) == {"Title", "Description", "Score", "Active"}
