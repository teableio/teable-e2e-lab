"""Artifacts are uploaded to CI and attached to reports, so a secret that
reaches one is a secret that has left the building. The scrub runs at the write
boundary; these pin its edges.
"""

from __future__ import annotations

import json

from framework.artifacts import (
    MIN_SCRUBBABLE_LENGTH,
    REDACTION,
    scrub,
    secret_values,
    write_case_result,
)
from framework.types import CaseError, CaseResult, Check


def test_a_secret_is_replaced_wherever_it_appears() -> None:
    text = 'error: license "SUPER-SECRET-KEY-123" rejected'
    assert scrub(text, ["SUPER-SECRET-KEY-123"]) == f'error: license "{REDACTION}" rejected'


def test_every_occurrence_goes_not_just_the_first() -> None:
    out = scrub("A-SECRET-VALUE and A-SECRET-VALUE", ["A-SECRET-VALUE"])
    assert "A-SECRET-VALUE" not in out
    assert out.count(REDACTION) == 2


def test_short_env_values_are_not_treated_as_secrets(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # A two-character value would corrupt unrelated evidence if replaced.
    monkeypatch.setenv("LICENSE_KEY", "ab")
    assert secret_values() == []


def test_a_long_env_value_is_picked_up(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LICENSE_KEY", "x" * MIN_SCRUBBABLE_LENGTH)
    assert "x" * MIN_SCRUBBABLE_LENGTH in secret_values()


def test_longer_secrets_are_replaced_before_shorter_ones(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("LICENSE_KEY", "abcdefgh")
    monkeypatch.setenv("TEABLE_LICENSE_KEY", "abcdefgh-extended")
    assert secret_values()[0] == "abcdefgh-extended"


def test_a_secret_quoted_in_an_error_never_reaches_disk(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # The realistic leak: the server echoes the key back inside a 400 body, and
    # the client faithfully records that body as evidence.
    secret = "LICENSE-abcdef-0123456789"
    monkeypatch.setenv("LICENSE_KEY", secret)

    result = CaseResult(
        case_id="smoke/one",
        title="t",
        run_id="r",
        verdict="fail",
        started_at="2026-08-11T00:00:00Z",
        finished_at="2026-08-11T00:00:01Z",
        duration_ms=1.0,
        target={"endpoint": "http://localhost"},
        checks=[Check(name="http.status", expected=200, actual=400, passed=False)],
        requests=[{"path": "/api/x", "response_body": f'{{"rejected":"{secret}"}}'}],
        error=CaseError(type="RuntimeError", message=f"key {secret} refused"),
    )

    path = write_case_result(tmp_path, result)
    written = path.read_text(encoding="utf-8")
    assert secret not in written
    assert written.count(REDACTION) == 2
    # Still valid JSON, and the surrounding evidence survives.
    parsed = json.loads(written)
    assert parsed["checks"][0]["actual"] == 400
