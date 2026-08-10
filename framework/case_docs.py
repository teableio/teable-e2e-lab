"""The case-description contract.

perf-lab requires a same-name markdown next to every case and checks that the
prose does not contradict the config. The reason is not tidiness: the `.md` is
what a reviewer, a PM, or an on-call engineer reads when a case goes red, and a
description that has drifted from the code is worse than none at all.

The rules here are deliberately few. Every added rule is a rule someone has to
satisfy at 6pm on a Friday, so only the ones that pay for themselves survive:
frontmatter that the report needs, and the section headings that force an author
to state the goal, the setup, the action, and — the one people skip — what is
actually being asserted.
"""

from __future__ import annotations

from dataclasses import dataclass

REQUIRED_FRONTMATTER_KEYS = ("owner", "tags", "enabled")
REQUIRED_SECTIONS = ("Goal", "Seed Phase", "Execute Phase", "Expectations", "Cleanup")


@dataclass(frozen=True)
class DocAudit:
    case_id: str
    problems: list[str]

    @property
    def ok(self) -> bool:
        return not self.problems


def split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Return (frontmatter, body). A missing block yields an empty mapping.

    Intentionally a shallow parser: the frontmatter carries an owner, a tag
    list, and an enabled flag. Reaching for a YAML dependency to read three
    keys would be the wrong trade.
    """
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text

    block = text[4:end]
    body = text[end + 5 :]
    parsed: dict[str, str] = {}
    current_key: str | None = None
    for raw in block.splitlines():
        if raw.startswith("  - ") and current_key:
            parsed[current_key] = f"{parsed.get(current_key, '')} {raw[4:].strip()}".strip()
            continue
        if ":" in raw and not raw.startswith(" "):
            key, _, value = raw.partition(":")
            current_key = key.strip()
            parsed[current_key] = value.strip()
    return parsed, body


def headings(body: str) -> list[str]:
    return [line[3:].strip() for line in body.splitlines() if line.startswith("## ")]


def audit_doc(case_id: str, text: str) -> DocAudit:
    problems: list[str] = []
    frontmatter, body = split_frontmatter(text)

    if not frontmatter:
        problems.append("missing the leading `---` frontmatter block")
    else:
        for key in REQUIRED_FRONTMATTER_KEYS:
            if key not in frontmatter:
                problems.append(f"frontmatter is missing `{key}`")

    present = headings(body)
    for section in REQUIRED_SECTIONS:
        if section not in present:
            problems.append(f"missing the `## {section}` section")

    title = f"# {case_id}"
    if title not in body:
        problems.append(f"body should carry the case id as its H1 (`{title}`)")

    return DocAudit(case_id=case_id, problems=problems)
