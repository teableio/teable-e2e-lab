from __future__ import annotations

from framework.case_docs import audit_doc, split_frontmatter

GOOD = """---
owner: qa
tags:
  - smoke
enabled: true
---

# a/one

## Goal

x

## Seed Phase

x

## Execute Phase

x

## Expectations

x

## Cleanup

x
"""


def test_a_complete_description_passes() -> None:
    assert audit_doc("a/one", GOOD).ok


def test_frontmatter_lists_are_collected() -> None:
    front, body = split_frontmatter(GOOD)
    assert front["owner"] == "qa"
    assert front["tags"] == "smoke"
    assert body.lstrip().startswith("# a/one")


def test_a_missing_expectations_section_is_caught() -> None:
    audit = audit_doc("a/one", GOOD.replace("## Expectations", "## Whatever"))
    assert not audit.ok
    assert any("Expectations" in p for p in audit.problems)


def test_a_missing_frontmatter_block_is_caught() -> None:
    audit = audit_doc("a/one", GOOD.split("---\n\n", 1)[1])
    assert not audit.ok
    assert any("frontmatter" in p for p in audit.problems)


def test_an_id_that_does_not_match_the_heading_is_caught() -> None:
    audit = audit_doc("a/two", GOOD)
    assert not audit.ok
    assert any("H1" in p for p in audit.problems)
