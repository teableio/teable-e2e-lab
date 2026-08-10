"""Fail-closed acceptance gate over a finished run's artifacts.

    uv run python scripts/verify_run_acceptance.py artifacts/<run-id>

This is what CI gates on — not the runner's exit code. The runner can only
report on cases it actually reached; this reads the plan and the artifacts and
refuses anything it cannot explain.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from framework.acceptance import evaluate_run  # noqa: E402
from framework.artifacts import read_case_results  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2

    run_dir = Path(argv[0])
    summary_path = run_dir / "run-summary.json"
    if not summary_path.exists():
        print(f"no run-summary.json in {run_dir} — the run did not finish", file=sys.stderr)
        return 1

    planned = json.loads(summary_path.read_text(encoding="utf-8"))["planned"]
    report = evaluate_run(planned, read_case_results(run_dir))
    print(report.render())

    if not report.accepted:
        print("\nrun REJECTED", file=sys.stderr)
        return 1
    print("\nrun accepted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
