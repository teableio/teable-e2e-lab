"""Fail when a sensitive-looking assignment carries a literal value.

    uv run python scripts/check_no_secrets.py             # the working tree
    uv run python scripts/check_no_secrets.py --staged    # what is about to be committed

`--staged` is what the pre-commit hook runs. It reads content out of the index
rather than off disk, because staging a file with a key and then editing the
file afterwards would otherwise slip past the check.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from framework.secret_scan import Finding, is_scannable, scan_files, scan_tree  # noqa: E402

# Paths that may exist locally but must never be tracked by git.
FORBIDDEN_TRACKED = ("docker/.env", ".lab/session.json", ".env.local", ".env")


def _git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, check=False
    )
    return result.stdout if result.returncode == 0 else ""


def tracked_files(root: Path) -> set[str]:
    return set(_git(root, "ls-files").split())


def staged_findings(root: Path) -> list[Finding]:
    # ACM: added, copied, modified. Deletions cannot introduce a secret.
    names = _git(root, "diff", "--cached", "--name-only", "--diff-filter=ACM").split("\n")
    contents = {}
    for name in (n for n in names if n and is_scannable(n)):
        # `git show :path` reads the staged blob, not the file on disk.
        contents[name] = _git(root, "show", f":{name}")
    return scan_files(contents)


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parent.parent
    staged_only = "--staged" in argv
    problems = 0

    tracked = tracked_files(root)
    for relative in FORBIDDEN_TRACKED:
        if relative in tracked:
            print(f"FAIL {relative} is tracked by git and must not be", file=sys.stderr)
            problems += 1

    findings = staged_findings(root) if staged_only else scan_tree(root)
    for finding in findings:
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

    scope = "staged changes" if staged_only else "working tree"
    print(f"no literal secrets found ({scope})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
