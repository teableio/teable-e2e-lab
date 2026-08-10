"""Core contract: what a case is, what a run produces, how a verdict is reached.

The organising idea, borrowed from teable-perf-lab: a case is *data*, execution
lives in a shared runner, and the result is *evidence* rather than a log line.

The one deliberate departure: perf-lab compares a metric against a threshold,
so its runners assert inline and throw. Functional acceptance needs the opposite
— one run should tell you everything that is wrong, not just the first thing.
So runners here do not raise on a failed expectation. They append a `Check`, and
the harness computes the verdict from the collected list.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, ClassVar, Generic, Literal, TypeVar

from pydantic import BaseModel

if TYPE_CHECKING:
    from framework.client import TeableClient

Verdict = Literal["pass", "fail", "skipped"]

# Severity exists so a case can record something it observed but does not want
# to gate on (a known product gap, a slow-but-correct path). Warnings show up in
# the report and never turn a run red.
Severity = Literal["blocking", "warning"]


class Check(BaseModel):
    """One externally visible expectation and what actually happened.

    `name` is a stable dotted path, not a sentence: `http.status`,
    `record.count`, `row.500.field.Active`. It is what a report groups by and
    what a human greps for, so keep it machine-shaped.
    """

    name: str
    expected: Any
    actual: Any
    passed: bool
    severity: Severity = "blocking"
    note: str | None = None


class Phase(BaseModel):
    """A named span of a case run, recorded whether or not the case passed."""

    name: str
    duration_ms: float


class CaseError(BaseModel):
    """An unexpected exception — distinct from a failed expectation.

    A failed `Check` means the product did something wrong. A `CaseError` means
    the case itself could not finish: the network died, a fixture could not be
    built, the runner hit a bug. Keeping them apart is what stops "the suite is
    red" from being ambiguous.
    """

    type: str
    message: str
    phase: str | None = None
    traceback: str | None = None


class CaseResult(BaseModel):
    """The full artifact for one case in one run. Written on every path."""

    case_id: str
    title: str
    run_id: str
    verdict: Verdict
    started_at: str
    finished_at: str
    duration_ms: float
    target: dict[str, str]
    checks: list[Check] = []
    phases: list[Phase] = []
    evidence: dict[str, Any] = {}
    requests: list[dict[str, Any]] = []
    error: CaseError | None = None
    skip_reason: str | None = None


@dataclass
class Checks:
    """Collector a runner writes expectations into.

    Every method returns whether the expectation held, so a runner can stop
    early when continuing would be meaningless (no point scanning rows when the
    create call 500'd) while still leaving the failure recorded.
    """

    items: list[Check] = field(default_factory=list)

    def _record(
        self,
        name: str,
        expected: Any,
        actual: Any,
        passed: bool,
        severity: Severity,
        note: str | None,
    ) -> bool:
        self.items.append(
            Check(
                name=name,
                expected=expected,
                actual=actual,
                passed=passed,
                severity=severity,
                note=note,
            )
        )
        return passed

    def equal(
        self,
        name: str,
        expected: Any,
        actual: Any,
        *,
        severity: Severity = "blocking",
        note: str | None = None,
    ) -> bool:
        return self._record(name, expected, actual, expected == actual, severity, note)

    def is_true(
        self,
        name: str,
        actual: bool,
        *,
        severity: Severity = "blocking",
        note: str | None = None,
    ) -> bool:
        return self._record(name, True, actual, actual is True, severity, note)

    def contains(
        self,
        name: str,
        needle: Any,
        haystack: Any,
        *,
        severity: Severity = "blocking",
        note: str | None = None,
    ) -> bool:
        return self._record(
            name, f"contains {needle!r}", haystack, needle in haystack, severity, note
        )

    def in_range(
        self,
        name: str,
        actual: float,
        low: float,
        high: float,
        *,
        severity: Severity = "blocking",
        note: str | None = None,
    ) -> bool:
        return self._record(
            name, f"{low}..{high}", actual, low <= actual <= high, severity, note
        )

    @property
    def failed(self) -> list[Check]:
        return [c for c in self.items if not c.passed and c.severity == "blocking"]

    @property
    def verdict(self) -> Verdict:
        return "fail" if self.failed else "pass"


@dataclass
class RunContext:
    """Everything a runner is allowed to reach for.

    Deliberately small. A runner gets an authenticated client, an identity for
    the run, and a place to note phases — nothing else. In particular there is
    no database handle: cases assert through the public API, because that is the
    surface the product actually promises.
    """

    client: TeableClient
    run_id: str
    case_id: str
    endpoint: str
    checks: Checks
    _phases: list[Phase] = field(default_factory=list)

    def record_phase(self, name: str, duration_ms: float) -> None:
        self._phases.append(Phase(name=name, duration_ms=duration_ms))

    @property
    def phases(self) -> list[Phase]:
        return list(self._phases)


class SkipCase(Exception):
    """Raised by a runner to declare a deterministic, expected skip.

    A skip must be a decision, never an accident — acceptance rejects any skip a
    case did not declare a reason for.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


ConfigT = TypeVar("ConfigT", bound=BaseModel)
FixtureT = TypeVar("FixtureT")
ObservationT = TypeVar("ObservationT")


class Runner(Generic[ConfigT, FixtureT, ObservationT]):
    """Shared execution for a family of cases, in four ordered stages.

    perf-lab splits a case into seed and execute. Functional testing needs a
    third stage split out: `verify`. Keeping it separate from `execute` is what
    makes "never trust the 200" a property of the framework instead of a habit
    each runner author has to remember — a runner with an empty verify is
    visibly wrong at review time.

    `cleanup` runs on every path, including when execute raised.
    """

    kind: ClassVar[str]

    def seed(self, ctx: RunContext, config: ConfigT) -> FixtureT:
        """Build the state the measured action needs. May be a no-op."""
        raise NotImplementedError

    def execute(self, ctx: RunContext, config: ConfigT, fixture: FixtureT) -> ObservationT:
        """Perform the action under test and return what was observed."""
        raise NotImplementedError

    def verify(
        self,
        ctx: RunContext,
        config: ConfigT,
        fixture: FixtureT,
        observation: ObservationT,
    ) -> None:
        """Prove the promised final state through the real read path.

        Write expectations into `ctx.checks`. Do not raise on a failed one.
        """
        raise NotImplementedError

    def cleanup(self, ctx: RunContext, config: ConfigT, fixture: FixtureT | None) -> None:
        """Remove what this case created. Runs even when execute failed."""
        return None

    def evidence(
        self,
        config: ConfigT,
        fixture: FixtureT | None,
        observation: ObservationT | None,
    ) -> dict[str, Any]:
        """Facts that explain the verdict: ids, counts, sampled rows."""
        return {}


@dataclass(frozen=True)
class Case(Generic[ConfigT]):
    """A registered, runnable case. Pure data — no behaviour of its own."""

    id: str
    title: str
    runner: type[Runner[ConfigT, Any, Any]]
    config: ConfigT
    timeout_s: int
    owner: str
    tags: tuple[str, ...]

    @property
    def group(self) -> str:
        return self.id.split("/", 1)[0]
