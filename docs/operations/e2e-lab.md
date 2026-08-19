# Running bug cases through teable-ee e2e

The executable path is deliberately the one teable-perf-lab proved out:

1. GitHub Actions checks out `e2e-lab`.
2. `resolve_inputs` checks out the `teableio/teable-ee` commit graph
   (`fetch-depth: 0` + `filter: tree:0` — the whole graph, no source) and
   resolves every requested ref to a pinned SHA. Everything downstream uses
   only those SHAs, so a branch moving mid-run cannot split the run across two
   revisions.
3. One `execute` job per commit: checkout teable-ee at the pinned SHA, inject
   the lab into `community/apps/nestjs-backend/test/e2e-lab/`, build the
   database from that commit's own migrations plus the standard e2e seed, and
   run every selected case serially through `@teable/backend-ee`'s vitest.
4. `report` collects every payload, renders the bug × commit table, and
   enforces acceptance fail-closed.

There is no seed/execute job split and no seed-dump cache. Bug fixtures are
small and built inside each case, and dumps could not be shared across commits
anyway — different commits carry different Prisma migrations, which is exactly
why perf-lab's cache key hashes the schema.

## Verdicts and gating

Each case observes one of `absent | present | error` and the framework labels
it against the case's declared `bug.status`:

|                  | `status: fixed` | `status: open` |
| ---------------- | --------------- | -------------- |
| observed absent  | pass ✅         | unexpected 💡  |
| observed present | regression ❌   | expected ⬜    |
| observed error   | error 💥        | error 💥       |

Only the **last commit of the dispatch (the gating column)** enforces
`bug.status`: a fixed bug reproducing on an older column is the world before
the fix, not a regression. An `error` fails on every column — the case never
reached its checkpoint and produced no observation, and counting that as
anything else would let a broken harness impersonate a stable bug.

Inside a runner the seam is `bugCheckpoint()`: anything thrown inside a
checkpoint is "the bug reproduced" (including a 500 from the endpoint under
test); anything thrown outside every checkpoint is `error`.

## Acceptance (fail-closed)

The report job fails when any of these hold, and only then:

- a planned (case × commit) cell has no payload, or more than one;
- a payload arrived for a case or commit outside the plan;
- a payload carries a verdict string the table cannot render;
- any cell is an `error`;
- the gating column has a regression.

Expected-fails never fail the run. Unexpected-passes never fail the run either
— they render as a 💡 notice asking a human to confirm the fix and flip
`bug.status` to `fixed`. Failing the run for good news teaches people to flip
status without verifying, which is how the metadata rots.

## Reading the table

```
| bug 用例          | issue | 声明  | `aaaa...` | `bbbb...` | `cccc...` | 变化点              |
| record/t1481-...  | T1481 | fixed |    ❌     |    ❌     |    ✅     | 修复落在 bbbb..cccc |
```

Column order is the dispatch order — pass commits oldest-first; the system
does not reorder by the git graph. A row's transition column names where the
observation flipped; a transition is never claimed across an error or missing
cell.

## Artifacts

- `e2e-lab-results-<shortsha>-<run>`: one per commit — a JSON payload and a
  markdown summary per case. Named without the attempt and uploaded with
  `overwrite`, so "Re-run failed jobs" replaces only the re-run column.
- `e2e-lab-comparison-<run>-<attempt>`: `comparison.json`, the exact model the
  acceptance gate judged.

Each payload records `caseId`, `commitSha`, `observed`, `verdict`, `gating`,
timing, runner details, and — on any failure — the normalized error including
the HTTP status and the server's own response body (truncated). The payloads
are written before any assertion throws; they, not the vitest exit code, are
the source of truth.

## Manual examples

Compare three revisions, all cases:

```bash
gh workflow run e2e-lab.yml \
  --repo teableio/e2e-lab \
  --ref main \
  -f teable_ee_commits="<sha-before-fix>,<sha-candidate>,develop" \
  -f case_filter=all
```

Single case on a single revision (gating applies — this asks "does the bug
behave as declared here"):

```bash
gh workflow run e2e-lab.yml \
  --repo teableio/e2e-lab \
  --ref main \
  -f teable_ee_commits=develop \
  -f case_filter=record/bulk-update-100-mixed-lands
```

Because `teableio/teable-ee` is private, the repository needs a read-only
deploy key stored as the `TEABLE_EE_CHECKOUT_SSH_KEY` secret.

## Local runs

See [.agents/skills/localrun/SKILL.md](../../.agents/skills/localrun/SKILL.md).
Same spec, same injection, long-lived local containers instead of job-local
ones. Local runs are direction-finding; GitHub Actions is the acceptance
surface.
