"""Guard against committing a real secret.

This repository is meant to be public, and the expensive mistake in a public
repository is not a design flaw — it is one line of config with a real key in
it, pushed at the end of a long day and living in the git history forever.

The rule is narrow on purpose: any assignment whose *name* looks sensitive must
have a value that is either an environment placeholder or an explicitly declared
throwaway. Anything else fails. That keeps the check quiet enough to stay
enabled, while making "paste the real key here to try it" impossible to commit
by accident.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

# Names that make a value worth scrutinising.
SENSITIVE_NAME = re.compile(
    r"(LICENSE_KEY|_TOKEN|_SECRET|SECRET_|PASSWORD|_API_KEY|ACCESS_KEY|PRIVATE_KEY)",
    re.IGNORECASE,
)

# `${VAR}` / `${VAR:-default}` — the value comes from the environment.
PLACEHOLDER = re.compile(r"^\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}$")

# `${{ secrets.NAME }}` — GitHub Actions.
GHA_SECRET = re.compile(r"^\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}$")

# Values committed on purpose because the stack they configure is disposable and
# recreated from scratch on every run. Adding to this list is a deliberate act;
# a value that is not here has to come from the environment.
KNOWN_THROWAWAY = frozenset(
    {
        "teable",
        "teable-api-lab-secret-key-not-a-real-one",
        "teable_api_lab_sandbox_jwt_secret",
        "teable_api_lab_mail_encryption_k",
        "teable_api_lab_store_encryption_",
        "teable_api_lab_token_encryption_",
        "teable_api_lab_dburl_encryption_",
        "teableapilabmail",
        "teableapilabstor",
        "teableapilabtokn",
        "teableapilabdbur",
        "TeableApiLab!2026",
    }
)

# Value prefixes that mean "this is code, not a credential" — a regex, a lookup,
# a literal container. Without these the scanner flags its own rule table.
CODE_VALUE_PREFIXES = (
    "os.environ",
    "self.",
    "config.",
    "re.compile",
    "frozenset",
    "(",
    "[",
    "{",
)

# Substrings that mark a value as an illustration rather than a credential —
# documentation showing how to pass a key. None of these can occur in a real
# base64 or hex key, so exempting them costs no coverage, and without them the
# README's own example turns the check red. A scanner that cries wolf is a
# scanner people learn to skip.
PLACEHOLDER_MARKERS = ("...", "<", "your-", "YOUR_", "xxx", "***", "$(", "…")

ASSIGNMENT = re.compile(r"^\s*(?:-\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+?)\s*$")

SCANNED_SUFFIXES = (".py", ".yaml", ".yml", ".toml", ".md", ".sh", ".env", ".json")

SKIP_DIRS = frozenset({".git", ".venv", "node_modules", "artifacts", ".lab", "__pycache__"})


@dataclass(frozen=True)
class Finding:
    path: str
    line_number: int
    name: str

    def render(self) -> str:
        return f"{self.path}:{self.line_number}: `{self.name}` has a literal value"


def _strip_quotes(value: str) -> str:
    value = value.split("#", 1)[0].strip() if not value.startswith(("'", '"')) else value
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def scan_line(line: str) -> str | None:
    """Return the offending variable name, or None when the line is fine."""
    match = ASSIGNMENT.match(line)
    if not match:
        return None
    name, raw_value = match.group(1), match.group(2)
    if not SENSITIVE_NAME.search(name):
        return None

    value = _strip_quotes(raw_value)
    if not value:
        return None
    if PLACEHOLDER.match(value) or GHA_SECRET.match(value):
        return None
    if value in KNOWN_THROWAWAY:
        return None
    # A reference rather than a value: `LICENSE_KEY` mentioned in prose, or a
    # dict lookup like os.environ.get("LICENSE_KEY").
    if value.startswith(CODE_VALUE_PREFIXES):
        return None
    if any(marker in value for marker in PLACEHOLDER_MARKERS):
        return None
    return name


def scan_text(path: str, text: str) -> list[Finding]:
    findings = []
    for number, line in enumerate(text.splitlines(), start=1):
        name = scan_line(line)
        if name:
            findings.append(Finding(path=path, line_number=number, name=name))
    return findings


def is_scannable(path: str) -> bool:
    return path.endswith(SCANNED_SUFFIXES) and not any(
        part in SKIP_DIRS for part in Path(path).parts
    )


def scan_files(files: Mapping[str, str]) -> list[Finding]:
    """Scan a path -> content mapping.

    Kept separate from any filesystem or git access so the pre-commit path can
    feed it *staged* content. Scanning the working tree would be the wrong
    check: staging a file with a key and then editing the file on disk would
    slip straight past it.
    """
    findings: list[Finding] = []
    for path in sorted(files):
        if is_scannable(path):
            findings.extend(scan_text(path, files[path]))
    return findings


def scan_tree(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SCANNED_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        relative = path.relative_to(root).as_posix()
        findings.extend(scan_text(relative, path.read_text(encoding="utf-8", errors="replace")))
    return findings
