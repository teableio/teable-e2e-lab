"""Case discovery and the three-way catalog agreement.

perf-lab's `check:catalog` fails loud when the files on disk, the imports, and
the registered array disagree. With hundreds of cases that check is the only
thing standing between you and a case that silently stopped running six weeks
ago. Same rule here, adapted to Python: the registry lists case *ids*, and every
id must have both a `.case.py` and a same-name `.md` on disk — no more, no less.
"""

from __future__ import annotations

import importlib.util
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from framework.types import Case

CASE_SUFFIX = ".case.py"
DOC_SUFFIX = ".md"
CASES_DIRNAME = "cases"


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def cases_dir() -> Path:
    return project_root() / CASES_DIRNAME


def case_id_from_path(path: Path, root: Path | None = None) -> str:
    """`cases/record/create-1k-text.case.py` -> `record/create-1k-text`."""
    relative = path.resolve().relative_to((root or cases_dir()).resolve())
    return relative.as_posix()[: -len(CASE_SUFFIX)]


def path_from_case_id(case_id: str, root: Path | None = None) -> Path:
    return (root or cases_dir()) / f"{case_id}{CASE_SUFFIX}"


def doc_path_from_case_id(case_id: str, root: Path | None = None) -> Path:
    return (root or cases_dir()) / f"{case_id}{DOC_SUFFIX}"


def discover_case_ids(root: Path | None = None) -> list[str]:
    base = root or cases_dir()
    if not base.exists():
        return []
    return sorted(
        case_id_from_path(p, base) for p in base.rglob(f"*{CASE_SUFFIX}") if p.is_file()
    )


@dataclass(frozen=True)
class CatalogDiff:
    """Pure comparison, so it can be unit-tested without touching the filesystem."""

    unregistered: list[str]
    """On disk but absent from the registry — a case nobody is running."""

    missing_file: list[str]
    """Registered but no `.case.py` — the registry points at nothing."""

    missing_doc: list[str]
    """Has a `.case.py` but no same-name `.md`."""

    duplicated: list[str]
    """Listed more than once in the registry."""

    @property
    def ok(self) -> bool:
        return not (self.unregistered or self.missing_file or self.missing_doc or self.duplicated)

    def render(self) -> str:
        lines: list[str] = []
        for label, items in (
            ("on disk but not registered", self.unregistered),
            ("registered but no .case.py on disk", self.missing_file),
            ("missing same-name .md", self.missing_doc),
            ("registered more than once", self.duplicated),
        ):
            for item in items:
                lines.append(f"  {item}  <- {label}")
        return "\n".join(lines)


def compare_catalog(
    registered: list[str], on_disk: list[str], with_docs: list[str]
) -> CatalogDiff:
    registered_set = set(registered)
    disk_set = set(on_disk)
    docs_set = set(with_docs)
    return CatalogDiff(
        unregistered=sorted(disk_set - registered_set),
        missing_file=sorted(registered_set - disk_set),
        missing_doc=sorted(disk_set - docs_set),
        duplicated=sorted(cid for cid, n in Counter(registered).items() if n > 1),
    )


def audit_catalog(registered: list[str], root: Path | None = None) -> CatalogDiff:
    base = root or cases_dir()
    on_disk = discover_case_ids(base)
    with_docs = [cid for cid in on_disk if doc_path_from_case_id(cid, base).exists()]
    return compare_catalog(registered, on_disk, with_docs)


def load_case(case_id: str, root: Path | None = None) -> Case[Any]:
    """Load a case file by path.

    Case files are not importable modules — `create-1k-text.case.py` is not a
    legal module name, on purpose. Keeping the filename identical to the case id
    is worth more than import sugar, and it keeps pytest from ever collecting
    them by accident.
    """
    path = path_from_case_id(case_id, root)
    if not path.exists():
        raise FileNotFoundError(f"case {case_id!r} has no file at {path}")

    spec = importlib.util.spec_from_file_location(f"case_{case_id.replace('/', '_')}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load case file {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    case = getattr(module, "case", None)
    if case is None:
        raise AttributeError(f"{path} must assign the result of define_case() to `case`")
    if not isinstance(case, Case):
        raise TypeError(f"{path}: `case` must come from define_case(), got {type(case)!r}")
    if case.id != case_id:
        raise ValueError(
            f"{path}: declared id {case.id!r} does not match its path ({case_id!r}). "
            "The id and the path must stay identical."
        )
    return case
