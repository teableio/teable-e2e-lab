"""Fail when a case description is missing or does not follow the contract.

Part of `lab check`; also runnable on its own:  uv run python scripts/check_case_docs.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from framework.case_docs import audit_doc  # noqa: E402
from framework.catalog import discover_case_ids, doc_path_from_case_id  # noqa: E402


def main() -> int:
    failures = 0
    for case_id in discover_case_ids():
        path = doc_path_from_case_id(case_id)
        if not path.exists():
            print(f"FAIL {case_id}: no same-name .md", file=sys.stderr)
            failures += 1
            continue
        audit = audit_doc(case_id, path.read_text(encoding="utf-8"))
        if not audit.ok:
            failures += 1
            for problem in audit.problems:
                print(f"FAIL {case_id}: {problem}", file=sys.stderr)

    if failures:
        print(f"\n{failures} case description(s) need fixing", file=sys.stderr)
        return 1
    print("case descriptions ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
