from __future__ import annotations

from framework.catalog import compare_catalog


def test_agreement_passes() -> None:
    diff = compare_catalog(["a/one"], ["a/one"], ["a/one"])
    assert diff.ok


def test_a_file_nobody_registered_is_caught() -> None:
    diff = compare_catalog([], ["a/one"], ["a/one"])
    assert not diff.ok
    assert diff.unregistered == ["a/one"]


def test_a_registration_pointing_at_nothing_is_caught() -> None:
    diff = compare_catalog(["a/ghost"], [], [])
    assert not diff.ok
    assert diff.missing_file == ["a/ghost"]


def test_a_case_without_a_description_is_caught() -> None:
    diff = compare_catalog(["a/one"], ["a/one"], [])
    assert not diff.ok
    assert diff.missing_doc == ["a/one"]


def test_double_registration_is_caught() -> None:
    diff = compare_catalog(["a/one", "a/one"], ["a/one"], ["a/one"])
    assert not diff.ok
    assert diff.duplicated == ["a/one"]
