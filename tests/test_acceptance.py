"""The acceptance gate is the thing CI trusts, so it gets tested hardest."""

from __future__ import annotations

from framework.acceptance import evaluate_run
from framework.types import CaseResult, Check


def result(
    case_id: str,
    verdict: str = "pass",
    *,
    checks: list[Check] | None = None,
    skip_reason: str | None = None,
) -> CaseResult:
    default = [Check(name="http.status", expected=200, actual=200, passed=True)]
    return CaseResult(
        case_id=case_id,
        title=case_id,
        run_id="test",
        verdict=verdict,  # type: ignore[arg-type]
        started_at="2026-08-11T00:00:00Z",
        finished_at="2026-08-11T00:00:01Z",
        duration_ms=1.0,
        target={"endpoint": "http://localhost"},
        checks=default if checks is None else checks,
        skip_reason=skip_reason,
    )


def test_a_clean_run_is_accepted() -> None:
    report = evaluate_run(["a/one", "a/two"], [result("a/one"), result("a/two")])
    assert report.accepted
    assert report.passed == ["a/one", "a/two"]


def test_a_planned_case_that_produced_no_result_rejects_the_run() -> None:
    # The failure this exists for: a case silently stops running and the
    # dashboard stays green because nothing reported red.
    report = evaluate_run(["a/one", "a/two"], [result("a/one")])
    assert not report.accepted
    assert report.missing_results == ["a/two"]


def test_a_result_nobody_planned_rejects_the_run() -> None:
    report = evaluate_run(["a/one"], [result("a/one"), result("a/stale")])
    assert not report.accepted
    assert report.unplanned_results == ["a/stale"]


def test_duplicate_results_reject_the_run() -> None:
    report = evaluate_run(["a/one"], [result("a/one"), result("a/one")])
    assert not report.accepted
    assert report.duplicate_results == ["a/one"]


def test_an_undeclared_skip_rejects_the_run() -> None:
    report = evaluate_run(["a/one"], [result("a/one", "skipped")])
    assert not report.accepted
    assert report.undeclared_skips == ["a/one"]


def test_a_declared_skip_is_accepted() -> None:
    report = evaluate_run(
        ["a/one"], [result("a/one", "skipped", skip_reason="feature not enabled on this build")]
    )
    assert report.accepted
    assert report.skipped == ["a/one"]


def test_a_pass_that_asserted_nothing_rejects_the_run() -> None:
    report = evaluate_run(["a/one"], [result("a/one", checks=[])])
    assert not report.accepted
    assert report.assertion_free_passes == ["a/one"]


def test_warning_only_checks_do_not_count_as_assertions() -> None:
    warning = Check(
        name="cleanup.completed", expected="ok", actual="ok", passed=True, severity="warning"
    )
    report = evaluate_run(["a/one"], [result("a/one", checks=[warning])])
    assert not report.accepted
    assert report.assertion_free_passes == ["a/one"]


def test_a_failure_rejects_the_run() -> None:
    report = evaluate_run(["a/one"], [result("a/one", "fail")])
    assert not report.accepted
    assert report.failed == ["a/one"]
