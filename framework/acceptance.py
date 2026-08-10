"""Fail-closed acceptance over a finished run.

Borrowed wholesale from perf-lab's result-acceptance gate, and it is the idea
that most changes how a suite behaves over time.

"Nothing turned red" is not acceptance. A case that never ran, a case that
vanished from the plan, a skip nobody declared, or a case that passed while
asserting nothing — all of those look identical to green on a dashboard, and all
of them mean the suite is quietly covering less than it claims. So the gate
starts from the *plan* and demands that every planned case produced exactly one
explainable result.

Pure functions only: the CLI and CI both feed it artifacts they read themselves.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from framework.types import CaseResult


@dataclass(frozen=True)
class AcceptanceReport:
    planned: list[str]
    passed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    missing_results: list[str] = field(default_factory=list)
    unplanned_results: list[str] = field(default_factory=list)
    duplicate_results: list[str] = field(default_factory=list)
    undeclared_skips: list[str] = field(default_factory=list)
    assertion_free_passes: list[str] = field(default_factory=list)

    @property
    def accepted(self) -> bool:
        return not (
            self.failed
            or self.missing_results
            or self.unplanned_results
            or self.duplicate_results
            or self.undeclared_skips
            or self.assertion_free_passes
        )

    def render(self) -> str:
        lines = [
            f"planned {len(self.planned)}  "
            f"pass {len(self.passed)}  fail {len(self.failed)}  skip {len(self.skipped)}"
        ]
        for label, items in (
            ("failed", self.failed),
            ("planned but produced no result", self.missing_results),
            ("produced a result but was not planned", self.unplanned_results),
            ("produced more than one result", self.duplicate_results),
            ("skipped without declaring a reason", self.undeclared_skips),
            ("passed without asserting anything", self.assertion_free_passes),
        ):
            for item in items:
                lines.append(f"  {item}  <- {label}")
        return "\n".join(lines)


def evaluate_run(planned: list[str], results: list[CaseResult]) -> AcceptanceReport:
    planned_set = set(planned)
    seen: dict[str, int] = {}
    for result in results:
        seen[result.case_id] = seen.get(result.case_id, 0) + 1

    passed, failed, skipped = [], [], []
    undeclared_skips, assertion_free = [], []

    for result in results:
        if result.verdict == "pass":
            passed.append(result.case_id)
            # A pass must rest on something. The executor already turns a
            # zero-check run into a failure; this catches an artifact that was
            # hand-edited or produced by an older build.
            if not any(c.severity == "blocking" for c in result.checks):
                assertion_free.append(result.case_id)
        elif result.verdict == "fail":
            failed.append(result.case_id)
        else:
            skipped.append(result.case_id)
            if not result.skip_reason:
                undeclared_skips.append(result.case_id)

    return AcceptanceReport(
        planned=list(planned),
        passed=sorted(passed),
        failed=sorted(failed),
        skipped=sorted(skipped),
        missing_results=sorted(planned_set - set(seen)),
        unplanned_results=sorted(set(seen) - planned_set),
        duplicate_results=sorted(cid for cid, n in seen.items() if n > 1),
        undeclared_skips=sorted(undeclared_skips),
        assertion_free_passes=sorted(assertion_free),
    )
