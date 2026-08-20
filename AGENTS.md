# Agent Guide

This repository is **e2e-lab**: bug regression comparison for Teable. Hand it a
list of teable-ee commits, it runs the same bug cases against every one of
them, and it answers in one table which two revisions a fix landed between — or
which two a regression appeared between.

The execution skeleton is ported from teable-perf-lab (the injection model, the
case/runner/registry layering, artifacts written before assertions, fail-closed
acceptance). The judgment layer is this repository's own: observation versus
declaration versus the gating column. Read [README.md](README.md) for the whole
picture, [.agents/README.md](.agents/README.md) to add or change a case, and
[docs/operations/e2e-lab.md](docs/operations/e2e-lab.md) for the pipeline.

## Working rules

- Keep changes inside this repository unless the user explicitly asks for
  another checkout. `teable-ee` is the runtime host: do not edit it or commit
  to it for e2e-lab's sake.
- Cases live in `cases/**/*.case.ts`, each with a same-name `.md`, each
  registered in `registry.ts`.
- Shared execution belongs in `framework/`. Case files carry no logic.
- Keep data deterministic and derive expected values locally, so a rerun is
  byte-comparable.
- Observe through the public API. The database is available for building
  fixtures the API cannot express, and only there — reaching for it inside a
  checkpoint throws (`framework/fixture-db.ts`).
- Every case guards v2. v1 still answers, so runners prove which engine served
  them (`framework/engine.ts`).

## Things that look like oversights and are not

Ask before "fixing" any of these:

- **A `fixed` case reproducing on an old commit is not red.** That is the world
  before the fix. Only the gating column turns a reproduction into a
  regression. The table is in `framework/verdict.ts`, one screen.
- **An unexpected fix (an `open` bug that stops reproducing) only warns.**
  Failing a run for good news teaches people to flip `status` without
  verifying, and that is how the metadata rots.
- **An `error` is red on every column.** A case that could not run produced
  zero observations; treating that as "as expected" lets a broken harness
  impersonate a stable bug forever.
- **One missing cell fails the whole run (fail-closed).** An empty cell reads
  as green to whoever opens the table.
- **Anything thrown inside a checkpoint counts as the bug, including a 500.**
  Some bugs simply are a 500. What separates "bug present" from "case broken"
  is the checkpoint boundary, not the exception type.
- **`acceptance.yml` is a compatibility shim and cannot just be deleted.**
  teable-enterprise's release pipeline dispatches it by filename — see
  [docs/dispatching.md](docs/dispatching.md). Retiring it starts with a PR
  there.

## Verification

```bash
pnpm check
```

That is source validation only. Local runtime runs are direction-finding and
follow the localrun skill in `.agents/skills/localrun/`, whose instructions are
not published with this repository; GitHub Actions is the acceptance surface.
