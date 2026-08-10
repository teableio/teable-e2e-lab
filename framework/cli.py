"""`lab` — the only entry point.

Deliberately hand-rolled rather than layered on pytest. The four-stage
lifecycle, soft-assertion collection, and per-case artifact are the product
here; a general test runner would have to be fought at each of those three
points. What pytest still owns is the framework's *own* unit tests under
tests/ — checking a pure function is exactly what it is good at.
"""

from __future__ import annotations

import argparse
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from framework import environment
from framework.artifacts import read_case_results, write_case_result, write_run_summary
from framework.case_docs import audit_doc
from framework.catalog import audit_catalog, doc_path_from_case_id, load_case, project_root
from framework.client import TeableClient
from framework.executor import run_case
from framework.secret_scan import scan_tree
from framework.types import Case

ARTIFACT_ROOT = "artifacts"


def _registered_case_ids() -> list[str]:
    """Read the registry without importing it as a package module."""
    import importlib.util

    path = project_root() / "registry.py"
    spec = importlib.util.spec_from_file_location("lab_registry", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.CASES)


def _new_run_id() -> str:
    return f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{secrets.token_hex(3)}"


def _select(case_ids: list[str], pattern: str | None) -> list[str]:
    if not pattern or pattern == "all":
        return case_ids
    return [cid for cid in case_ids if cid == pattern or cid.startswith(f"{pattern}/")]


def _session_or_bootstrap(endpoint: str | None) -> environment.Session:
    target = endpoint or environment.default_endpoint()
    session = environment.load_session()
    if session and session.endpoint == target:
        return session
    if not environment.wait_for_health(target, timeout_s=10.0):
        raise SystemExit(
            f"no healthy Teable at {target}.\n"
            "  start one with:  lab up\n"
            "  or point elsewhere with:  LAB_ENDPOINT=https://... lab run ..."
        )
    session = environment.sign_in_or_up(target)
    environment.save_session(session)
    return session


# -- commands ------------------------------------------------------------


def cmd_up(args: argparse.Namespace) -> int:
    print("starting the target stack (docker compose up -d --wait)...")
    try:
        environment.compose_up()
    except Exception as exc:  # noqa: BLE001
        print(f"stack did not come up: {exc}", file=sys.stderr)
        print(environment.compose_logs(50), file=sys.stderr)
        return 1

    endpoint = environment.default_endpoint()
    if not environment.wait_for_health(endpoint):
        print(f"stack is up but {endpoint}/health never answered", file=sys.stderr)
        print(environment.compose_logs(50), file=sys.stderr)
        return 1

    session = environment.sign_in_or_up(endpoint)
    environment.save_session(session)
    print(f"ready: {endpoint}  (signed in as {session.email})")
    return 0


def cmd_down(args: argparse.Namespace) -> int:
    environment.compose_down()
    path = environment.session_path()
    path.unlink(missing_ok=True)
    print("target stack stopped and its state dropped")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    endpoint = args.endpoint or environment.default_endpoint()
    problems: list[str] = []

    healthy = environment.wait_for_health(endpoint, timeout_s=5.0)
    print(f"  target reachable  {endpoint}  {'ok' if healthy else 'FAILED'}")
    if not healthy:
        problems.append(f"no healthy Teable at {endpoint} — run `lab up`")

    registered = _registered_case_ids()
    diff = audit_catalog(registered)
    print(f"  catalog           {len(registered)} registered  {'ok' if diff.ok else 'FAILED'}")
    if not diff.ok:
        problems.append("catalog disagrees:\n" + diff.render())

    if healthy:
        try:
            session = _session_or_bootstrap(endpoint)
            with TeableClient(endpoint, cookie=session.cookie) as client:
                me = client.get("/api/auth/user/me")
            ok = me.status_code == 200
            print(f"  session           {session.email}  {'ok' if ok else 'FAILED'}")
            if not ok:
                problems.append(f"session rejected: HTTP {me.status_code} {me.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            print("  session           FAILED")
            problems.append(f"authentication failed: {exc}")

    if problems:
        print("\n" + "\n".join(f"! {p}" for p in problems), file=sys.stderr)
        return 1
    print("\nall checks passed")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    selected = _select(_registered_case_ids(), args.pattern)
    for case_id in selected:
        case = load_case(case_id)
        print(f"{case_id:<44} {case.title}")
    print(f"\n{len(selected)} case(s)")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    registered = _registered_case_ids()
    diff = audit_catalog(registered)
    if not diff.ok:
        print("catalog check FAILED:", file=sys.stderr)
        print(diff.render(), file=sys.stderr)
        return 1
    print(f"catalog ok: {len(registered)} case(s), each with a file and a same-name .md")

    # Loading every case proves the configs validate and the ids match paths —
    # the Python stand-in for perf-lab's compile-time runner/config binding.
    for case_id in registered:
        load_case(case_id)
    print(f"all {len(registered)} case(s) load and validate")

    doc_problems = 0
    for case_id in registered:
        audit = audit_doc(case_id, doc_path_from_case_id(case_id).read_text(encoding="utf-8"))
        for problem in audit.problems:
            print(f"  {case_id}: {problem}", file=sys.stderr)
            doc_problems += 1
    if doc_problems:
        print(f"{doc_problems} description problem(s)", file=sys.stderr)
        return 1
    print("case descriptions ok")

    # This repository is public: a literal credential must never reach a commit.
    findings = scan_tree(project_root())
    for finding in findings:
        print(f"  {finding.render()}", file=sys.stderr)
    if findings:
        print(
            f"{len(findings)} literal secret(s) — see scripts/check_no_secrets.py",
            file=sys.stderr,
        )
        return 1
    print("no literal secrets found")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    registered = _registered_case_ids()
    diff = audit_catalog(registered)
    if not diff.ok:
        print("refusing to run: the catalog disagrees\n" + diff.render(), file=sys.stderr)
        return 1

    selected = _select(registered, args.pattern)
    if not selected:
        print(f"no case matches {args.pattern!r}", file=sys.stderr)
        return 1

    session = _session_or_bootstrap(args.endpoint)
    run_id = _new_run_id()
    artifact_dir = project_root() / ARTIFACT_ROOT / run_id
    print(f"run {run_id}  ->  {session.endpoint}  ({len(selected)} case(s))\n")

    cases: list[Case[Any]] = [load_case(cid) for cid in selected]
    counts = {"pass": 0, "fail": 0, "skipped": 0}

    for case in cases:
        result = run_case(
            case,
            client_factory=lambda: TeableClient(session.endpoint, cookie=session.cookie),
            run_id=run_id,
            endpoint=session.endpoint,
        )
        write_case_result(artifact_dir, result)
        counts[result.verdict] += 1

        mark = {"pass": "PASS", "fail": "FAIL", "skipped": "SKIP"}[result.verdict]
        print(f"  {mark}  {case.id:<44} {result.duration_ms:>9.0f}ms")
        if result.verdict == "fail":
            for check in result.checks:
                if not check.passed and check.severity == "blocking":
                    print(
                        f"          {check.name}: "
                        f"expected {check.expected!r}, got {check.actual!r}"
                    )
            if result.error:
                err = result.error
                print(f"          {err.phase}: {err.type}: {err.message}")

    summary = {
        "run_id": run_id,
        "endpoint": session.endpoint,
        "planned": selected,
        "counts": counts,
        "finished_at": datetime.now(UTC).isoformat(),
    }
    write_run_summary(artifact_dir, summary)

    print(
        f"\n{counts['pass']} passed / {counts['fail']} failed / {counts['skipped']} skipped"
        f"\nartifacts: {artifact_dir.relative_to(project_root())}"
    )
    return 1 if counts["fail"] else 0


def cmd_report(args: argparse.Namespace) -> int:
    artifact_dir = Path(args.run_dir) if args.run_dir else _latest_run_dir()
    if artifact_dir is None or not artifact_dir.exists():
        print("no run artifacts found", file=sys.stderr)
        return 1

    results = read_case_results(artifact_dir)
    for result in results:
        print(f"{result.verdict.upper():<8} {result.case_id:<44} {result.duration_ms:>9.0f}ms")
        for check in result.checks:
            if not check.passed:
                print(f"    {check.severity}: {check.name} -> {check.actual!r}")
    print(f"\n{len(results)} case result(s) in {artifact_dir}")
    return 0


def _latest_run_dir() -> Path | None:
    root = project_root() / ARTIFACT_ROOT
    if not root.exists():
        return None
    runs = sorted((p for p in root.iterdir() if p.is_dir()), reverse=True)
    return runs[0] if runs else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lab", description="Teable API acceptance lab")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("up", help="start the disposable target stack and sign in").set_defaults(
        func=cmd_up
    )
    sub.add_parser("down", help="stop the stack and drop its state").set_defaults(func=cmd_down)

    doctor = sub.add_parser("doctor", help="check the environment before running anything")
    doctor.add_argument("--endpoint")
    doctor.set_defaults(func=cmd_doctor)

    lst = sub.add_parser("list", help="list registered cases")
    lst.add_argument("pattern", nargs="?", default=None)
    lst.set_defaults(func=cmd_list)

    sub.add_parser("check", help="static checks: catalog agreement and case validity").set_defaults(
        func=cmd_check
    )

    run = sub.add_parser("run", help="run cases against the target")
    run.add_argument("pattern", nargs="?", default="all", help="case id, group, or 'all'")
    run.add_argument("--endpoint")
    run.set_defaults(func=cmd_run)

    report = sub.add_parser("report", help="print the results of a run")
    report.add_argument("run_dir", nargs="?", default=None)
    report.set_defaults(func=cmd_report)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
