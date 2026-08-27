# Running bug cases through teable-ee e2e

The executable path is deliberately the one teable-perf-lab proved out:

1. GitHub Actions checks out `e2e-lab`.
2. `resolve_inputs` checks out the `teableio/teable-ee` commit graph
   (`fetch-depth: 0` + `filter: tree:0` — the whole graph, no source) and
   resolves every requested ref to a pinned SHA. Everything downstream uses
   only those SHAs, so a branch moving mid-run cannot split the run across two
   revisions.
3. One `execute` job per commit **per engine**: checkout teable-ee at the
   pinned SHA, inject the lab into
   `community/apps/nestjs-backend/test/e2e-lab/`, build the database from that
   commit's own migrations plus the standard e2e seed, and run every selected
   case through `@teable/backend-ee`'s vitest.

   Both engines briefly shared a job, which was cheaper by one bootstrap and
   wrong: two passes against one database means the second engine runs on
   state the first left, and the guarded column is what would have been
   reading it. Split, each engine has its own containers and its own database,
   and the jobs run at the same time — the wall clock is one engine's, not
   two. This is the arrangement teable-perf-lab has run both engines on all
   along.

4. `report` collects every payload, renders the bug × commit table, and
   enforces acceptance fail-closed.

There is no seed/execute job split and no seed-dump cache. Bug fixtures are
small and built inside each case, and dumps could not be shared across commits
anyway — different commits carry different Prisma migrations, which is exactly
why perf-lab's cache key hashes the schema.

## The two engines

**v2 is guarded. v1 is a reference.**

v2 is where fixes land, so a bug returning there is a regression someone must
act on, and the verdict table below applies to it in full. v1 is run to answer
a different question — what does the engine our older customers are still on do
with the same case — and **nothing it reports fails a run**
(`framework/verdict.ts`). It renders as its own table under the guarded one.

Reaching v1 takes more than an environment switch, and the reason is worth
knowing before trusting any v1 cell. It is also the one thing teable-perf-lab
does not have to do: its cases run against the base the prisma e2e seed writes
straight into the database, which never went through the product's create-base
path and so carries `v2_enabled = false`. The switch alone decides there. Every
case here builds its own base through the API instead — that is what keeps
cases from disturbing each other — and the API stamps it. Routing asks `FORCE_V2_ALL` first and the
base's own v2 flag second, and the product stamps every base it creates as v2 —
so turning the switch off just falls through to the second rule. Measured
2026-08-27: a full 129-case run with the switch off produced **not one**
observation different from the v2 baseline, and the response header said why
(reason `new_base` instead of `env_force_v2_all`). So `framework/case-base.ts`
unstamps each case's base before the runner touches it. What that cannot do is
make a base that was _born_ on v1, which is what real v1 customers have. That
gap is the standing reason v1 never gates.

### Cases that cannot be asked of v1

A case declares `skipV1: "why"` and its v1 cell renders `⊘` — never run, never
red. Two different things legitimately land there, which is why the field is a
sentence and not a boolean:

- **the feature does not exist on v1** — required links, undo capture columns,
  field validation. v1 users do not have the bug because they do not have the
  feature.
- **the fixture cannot be built on v1** — a stored shape v1's own API
  normalizes away. The feature works on v1; the case just cannot set up its
  question there.

Skipping is always DECLARED. Sniffing it out of an error message fails open: a
case that genuinely breaks, whose error happens to read like a capability
refusal, would be skipped forever and nobody would learn. Of 129 cases, 11
declare it — established by re-asking each failure on a clean v1 base without
the case's own fixture, which is the only method that separates a real v1
defect from a v2-shaped fixture.

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

- a planned (case × commit) cell has no payload, or more than one — the
  **v2** cells only; the same problems on the v1 side are listed under the
  reference table and fail nothing;
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
| case              | issue | status | `aaaa` | `bbbb` | `cccc` | transition             |
| record/t1481-...  | T1481 | fixed  |   ❌   |   ❌   |   ✅   | fixed between bbbb..cccc |
```

Column order is the dispatch order — pass commits oldest-first; the system
does not reorder by the git graph. A row's transition column names where the
observation flipped; a transition is never claimed across an error or missing
cell.

## Artifacts

- `e2e-lab-results-<shortsha>-<run>`: one per commit — a JSON payload and a
  markdown summary per case per engine, the engine in the file name as well as
  in the payload (a shared stem would leave one engine overwriting the other,
  which the fail-closed report would then read as a missing cell). Named without the attempt and uploaded with
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
  --repo teableio/teable-e2e-lab \
  --ref main \
  -f teable_ee_commits="<sha-before-fix>,<sha-candidate>,develop" \
  -f case_filter=all
```

Single case on a single revision (gating applies — this asks "does the bug
behave as declared here"):

```bash
gh workflow run e2e-lab.yml \
  --repo teableio/teable-e2e-lab \
  --ref main \
  -f teable_ee_commits=develop \
  -f case_filter=record/bulk-update-100-mixed-lands
```

Because `teableio/teable-ee` is private, the repository needs a read-only
access token stored as the `TEABLE_EE_CHECKOUT_TOKEN` secret (a
fine-grained PAT with read-only Contents access to that repository is the
tight grant).

## The develop-push trigger and its check run

teable-ee's `teable-e2e-lab-trigger.yml` dispatches this workflow on every
develop push that touches the backend, pinned to that push's SHA — the
watchdog question "did this commit re-break a fixed bug", asked without anyone
pressing a button. Before dispatching it opens an **E2E Lab Regression** check
run on the pushed commit (as the `teable-remote-ci` GitHub App, the same App
teable-enterprise's remote suites report through) and passes its id here as
`teable_ee_check_run_id`.

The report job concludes that check run after the acceptance gate, `always()`,
with the same verdict the gate reached — success only when acceptance passed,
`cancelled` when the run was cancelled, failure otherwise, including runs that
broke before a comparison existed. The output carries the bug × commit table
from the very `comparison.json` acceptance judged; full logs and artifacts are
one click away through the details link, because this repository is public and
needs no private log channel.

Concluding needs the App credentials as secrets **in this repository**:
`RCI_APP_ID` and `RCI_APP_PRIVATE_KEY`, the same pair teable-ee and
teable-enterprise already hold. Hand dispatches leave the input empty and skip
the whole leg, so a missing pair only breaks triggered runs — visibly, in the
conclude step.

Two deliberate asymmetries against the remote-ci suites:

- **The native "Re-run" button on the check run does nothing.** The rerequest
  webhook worker recognizes only remote-ci suites (by their `external_id`
  shape) and ignores this check on purpose. Re-ask the question from
  teable-ee's "Trigger Teable E2E Lab" workflow instead.
- **A lost run is reaped late, not never.** If this workflow dies without
  concluding (runner lost, workflow broken), the enterprise-side watchdog
  fails the check run after the lab's own ceiling — longer than the remote-ci
  suites' 75 minutes, because a full-corpus column is allowed 120.

## Local runs

Follow the localrun skill, which is not published with this repository; ask the
team for it.
Same spec, same injection, long-lived local containers instead of job-local
ones. Local runs are direction-finding; GitHub Actions is the acceptance
surface.

## Teable storage and Feishu card

Two tables in the shared perf-lab base mirror teable-perf-lab's pattern
(catalog + result stream):

- **E2E Bug Cases (readonly)** (`tblgKLRoSAiKsIP7ZKi`): the registry published
  for humans, upserted by Case ID from `sync-cases.yml` on every push to main
  that touches cases or the registry. A read surface only — the registry in
  git stays the single source of truth.
- **Regression Track** (`tblhDr6yHUAkEMcJuNC`): one row per case × commit per
  run attempt, upserted by the unique Run Key
  (`<runId>-<attempt>-<caseId>-<teableEeShortSha>`) from the report job. Rows
  carry the verdict, the observation, gating, the pinned teable-ee SHA, timing,
  checkpoint evidence, the normalized error, and the per-case summary markdown.

Both writers live behind `TEABLE_E2E_LAB_TOKEN` and skip cleanly (saying so)
when it is absent. They are best-effort and independent of acceptance: the
artifacts remain the source of truth; the tables exist so history is queryable
without downloading them. Filters in the upsert address columns by FIELD ID,
never by name — Teable silently drops a filter naming a missing field and
answers 200, which would turn "find my row" into "the whole table".

The report job also posts one Feishu card per run (`FEISHU_E2E_WEBHOOK_URL`),
built from the same `comparison.json` the acceptance gate judges: verdict
header, per-row cell strips with transition points, and the lists that need a
human (regressions, errors, missing cells, unexpectedly-fixed). Teable and
Feishu are independent report steps so one outage cannot hide the other.
