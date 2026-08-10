"""`define_case` — the only sanctioned way to declare a case.

The type binding is the point. `runner` and `config` share one TypeVar, so
pairing a runner with the wrong config shape fails `mypy` at the case file
itself, instead of compiling clean and blowing up at run time when the runner
reads a field the config never had. This is the Python equivalent of perf-lab's
`PerfCaseConfigByRunner` map.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from framework.types import Case, ConfigT, Runner

# A case id mirrors its path on disk: cases/record/create-1k-text.case.py
# becomes record/create-1k-text. Lowercase, digits, and hyphens only — the id
# ends up in filenames, report columns, and CLI filters, so it stays boring.
CASE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9]+(?:-[a-z0-9]+)*$")


def define_case(
    *,
    id: str,
    title: str,
    runner: type[Runner[ConfigT, Any, Any]],
    config: ConfigT,
    owner: str,
    tags: Sequence[str] = (),
    timeout_s: int = 300,
) -> Case[ConfigT]:
    if not CASE_ID_PATTERN.match(id):
        raise ValueError(
            f"case id {id!r} must look like '<group>/<name>' using lowercase words "
            "separated by hyphens, and must equal its path under cases/"
        )
    if not title.strip():
        raise ValueError(f"case {id!r} needs a title a reader can understand without the code")
    if timeout_s <= 0:
        raise ValueError(f"case {id!r} needs a positive timeout_s")

    return Case(
        id=id,
        title=title,
        runner=runner,
        config=config,
        timeout_s=timeout_s,
        owner=owner,
        tags=tuple(tags),
    )
