"""Result artifacts — one JSON per case, written on every path.

perf-lab writes a payload even when the case blew up, and carries the completed
phases, ids, and partial state into it. That is what makes a red CI run
actionable instead of a mystery, and it is the single cheapest thing to copy.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from framework.types import CaseResult

ARTIFACT_SUFFIX = ".result.json"

# Environment variables whose values must never survive into an artifact. The
# client already declines to log headers, so the realistic leak path is an error
# response or a stack trace that quotes a secret back at us — which no amount of
# care at the call site can rule out. Scrubbing at the write boundary is the one
# place that catches all of them.
SECRET_ENV_NAMES = (
    "BACKEND_ENTERPRISE_LICENSE_KEY",
    "LICENSE_KEY",
    "TEABLE_LICENSE_KEY",
    "LAB_TOKEN",
    "TEABLE_TOKEN",
)

# Below this length a "secret" is more likely to be a common substring, and
# replacing it would corrupt unrelated evidence.
MIN_SCRUBBABLE_LENGTH = 8

REDACTION = "<redacted-secret>"


def secret_values() -> list[str]:
    values = []
    for name in SECRET_ENV_NAMES:
        value = os.environ.get(name, "").strip()
        if len(value) >= MIN_SCRUBBABLE_LENGTH:
            values.append(value)
    # Longest first, so a secret containing another is replaced whole.
    return sorted(values, key=len, reverse=True)


def scrub(text: str, secrets: list[str] | None = None) -> str:
    for value in secret_values() if secrets is None else secrets:
        text = text.replace(value, REDACTION)
    return text


def artifact_name(case_id: str) -> str:
    """`record/create-1k-text` -> `record__create-1k-text.result.json`."""
    return case_id.replace("/", "__") + ARTIFACT_SUFFIX


def write_case_result(artifact_dir: Path, result: CaseResult) -> Path:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / artifact_name(result.case_id)
    # `default=str` keeps a stray non-serialisable value in evidence from losing
    # the whole artifact — a degraded record beats no record.
    serialised = json.dumps(
        result.model_dump(mode="json"), indent=2, ensure_ascii=False, default=str
    )
    path.write_text(scrub(serialised), encoding="utf-8")
    return path


def read_case_results(artifact_dir: Path) -> list[CaseResult]:
    results: list[CaseResult] = []
    for path in sorted(artifact_dir.glob(f"*{ARTIFACT_SUFFIX}")):
        results.append(CaseResult.model_validate_json(path.read_text(encoding="utf-8")))
    return results


def write_run_summary(artifact_dir: Path, summary: dict[str, Any]) -> Path:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / "run-summary.json"
    serialised = json.dumps(summary, indent=2, ensure_ascii=False, default=str)
    path.write_text(scrub(serialised), encoding="utf-8")
    return path
