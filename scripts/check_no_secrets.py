"""Fail when a sensitive-looking assignment carries a literal value.

Part of `lab check`; also runnable alone:  uv run python scripts/check_no_secrets.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from framework.secret_scan import scan_tree  # noqa: E402

# Paths that may exist locally but must never be tracked by git. Having them
# locally is normal; having them in a commit is the accident this catches.
FORBIDDEN_TRACKED = ("docker/.env", ".lab/session.json", ".env.local", ".env")


def tracked_files(root: Path) -> set[str]:
    result = subprocess.run(
        ["git", "ls-files"], cwd=root, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        return set()
    return set(result.stdout.split())


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    problems = 0

    tracked = tracked_files(root)
    for relative in FORBIDDEN_TRACKED:
        if relative in tracked:
            print(f"FAIL {relative} is tracked by git and must not be", file=sys.stderr)
            problems += 1

    for finding in scan_tree(root):
        print(f"FAIL {finding.render()}", file=sys.stderr)
        problems += 1

    if problems:
        print(
            f"\n{problems} literal secret(s). Move the value to an environment "
            "variable and reference it as ${NAME}, or — if it really is a "
            "throwaway for the disposable stack — add it to KNOWN_THROWAWAY in "
            "framework/secret_scan.py so the decision is recorded.",
            file=sys.stderr,
        )
        return 1
    print("no literal secrets found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
