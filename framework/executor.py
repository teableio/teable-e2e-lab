"""The four-stage driver: seed -> execute -> verify -> cleanup.

Mirrors perf-lab's `runPerfCase`, with functional-testing semantics:

- an artifact is written on every path, including when the case blew up;
- a failed expectation and a crashed case are different verdicts with different
  evidence, never both flattened into "red";
- cleanup runs even when execute raised, and a cleanup failure is reported
  without changing the product verdict — the product did not misbehave, the
  test's own housekeeping did;
- a case that recorded no expectations at all fails. A green run whose cases
  assert nothing is the worst possible outcome, because it buys false
  confidence; the framework refuses to produce it.
"""

from __future__ import annotations

import time
import traceback
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from framework.client import TeableClient
from framework.types import (
    Case,
    CaseError,
    CaseResult,
    Check,
    Checks,
    RunContext,
    SkipCase,
    Verdict,
)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def run_case(
    case: Case[Any],
    *,
    client_factory: Callable[[], TeableClient],
    run_id: str,
    endpoint: str,
) -> CaseResult:
    started_at = _now()
    started = time.perf_counter()

    checks = Checks()
    client = client_factory()
    ctx = RunContext(
        client=client,
        run_id=run_id,
        case_id=case.id,
        endpoint=endpoint,
        checks=checks,
    )

    runner = case.runner()
    fixture: Any = None
    observation: Any = None
    error: CaseError | None = None
    skip_reason: str | None = None
    stage = "seed"

    def timed(name: str, fn: Callable[[], Any]) -> Any:
        stage_started = time.perf_counter()
        try:
            return fn()
        finally:
            ctx.record_phase(name, round((time.perf_counter() - stage_started) * 1000, 2))

    try:
        fixture = timed("seed", lambda: runner.seed(ctx, case.config))
        stage = "execute"
        observation = timed("execute", lambda: runner.execute(ctx, case.config, fixture))
        stage = "verify"
        timed("verify", lambda: runner.verify(ctx, case.config, fixture, observation))
    except SkipCase as skip:
        skip_reason = skip.reason
    except Exception as exc:  # noqa: BLE001 - every failure must reach the artifact
        error = CaseError(
            type=type(exc).__name__,
            message=str(exc),
            phase=stage,
            traceback="".join(traceback.format_exception(exc))[-4000:],
        )
    finally:
        try:
            timed("cleanup", lambda: runner.cleanup(ctx, case.config, fixture))
        except Exception as exc:  # noqa: BLE001
            # Housekeeping failure. Recorded so leaked fixtures are visible, but
            # it does not decide whether the product behaved correctly.
            checks.items.append(
                Check(
                    name="cleanup.completed",
                    expected="cleanup succeeds",
                    actual=f"{type(exc).__name__}: {exc}",
                    passed=False,
                    severity="warning",
                    note="test housekeeping failed; the target may hold leftover fixtures",
                )
            )

    verdict: Verdict
    if skip_reason is not None:
        verdict = "skipped"
    elif error is not None:
        verdict = "fail"
    else:
        if not checks.items:
            checks.items.append(
                Check(
                    name="case.recorded_expectations",
                    expected="at least one expectation",
                    actual=0,
                    passed=False,
                    note="the runner completed without asserting anything — "
                    "a case that checks nothing cannot pass",
                )
            )
        verdict = checks.verdict

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    evidence = _safe_evidence(runner, case, fixture, observation)
    if duration_ms > case.timeout_s * 1000:
        # Advisory only: Python cannot safely kill a synchronous runner
        # mid-flight, so the HTTP-level timeout is the real guard. This flags a
        # case that ran long enough to deserve attention.
        evidence["exceeded_timeout_s"] = case.timeout_s

    result = CaseResult(
        case_id=case.id,
        title=case.title,
        run_id=run_id,
        verdict=verdict,
        started_at=started_at,
        finished_at=_now(),
        duration_ms=duration_ms,
        target={"endpoint": endpoint},
        checks=checks.items,
        phases=ctx.phases,
        evidence=evidence,
        requests=client.requests,
        error=error,
        skip_reason=skip_reason,
    )
    client.close()
    return result


def _safe_evidence(
    runner: Any, case: Case[Any], fixture: Any, observation: Any
) -> dict[str, Any]:
    """Evidence collection must never be the reason a result is lost."""
    try:
        return dict(runner.evidence(case.config, fixture, observation))
    except Exception as exc:  # noqa: BLE001
        return {"evidence_error": f"{type(exc).__name__}: {exc}"}
