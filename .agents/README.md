# Adding a case

The full loop for adding a bug case. This is the only source for the process —
do not restate it elsewhere.

## 1. Settle four things first

- **What user-visible sequence reproduces it?** Backend cases observe through
  the public API. A confirmed frontend defect may use the shared headless
  Chromium runtime when no API assertion can express the bug. Browser setup
  still uses APIs, and the checkpoint observes both the real UI and its real
  public-API traffic; mocked success responses do not qualify. Going around
  those surfaces skips the layers that break most often: state transitions,
  caching, serialization, and permission filtering. **Building the fixture**
  may write to the database directly
  (`framework/fixture-db.ts`) to reach state the API cannot produce on request:
  a drifted stored snapshot, field metadata out of step with its physical
  column, a foreign key some retired write path cleared. That boundary is
  enforced, not merely documented — asking for a database handle inside a
  `bugCheckpoint()` throws.
- **Which engine is the bug on?** teable-ee has two record engines, and v1 bugs
  are not being fixed, so there is one engine here rather than a choice: every
  case guards v2. But v1 is still present and still answers, and **silently
  falling back to it is the worst failure this harness can have** — the case
  asks its question of code that never had the bug and is green on every
  column. So runners prove it in setup with `assertServedByV2()`, asserting on
  **the response to the request the case actually depends on** rather than a
  separate probe: a probe that reaches v2 while the operation under test
  quietly does not is exactly the shape worth catching. Assert the feature too
  (`x-teable-v2-feature`) — a bug in `getRecords` learns nothing from "some v2
  endpoint works". See `framework/engine.ts`.
- **Where is the checkpoint?** Anything thrown inside `bugCheckpoint()` counts
  as the bug reproducing; anything thrown outside it means the case never ran.
  Setup — building tables, seeding rows, verifying the fixture stands up —
  belongs outside. Keeping fixture verification outside is deliberate: every
  conclusion rests on the starting state being right, so a fixture that did not
  come up should be judged an error, not mistaken for the bug.
- **What is the status?** Not yet fixed is `open` (reproducing is expected and
  is not red); fixed is `fixed` (reproducing is a regression, red on the gating
  column). Sentinel cases — guarding currently-correct behavior with no
  historical bug behind them — use `issue: "sentinel/<name>"` with status
  `fixed`.

## 2. Write the files

- Case: `cases/<group>/<name>.case.ts`, where `id` must equal `<group>/<name>`
  (checked). `id`, `issue`, and `status` must be string literals — the planner
  and the checks read them by static parsing.
- Doc: a same-name `.md` in the same directory. Name the issue, the
  reproduction, what the checkpoint asserts, and why the data is shaped the way
  it is. Nobody will remember what T1481 was in six months; the doc is for
  them.
- Register: import it in `registry.ts` and add it to the `cases` array.
- Execution logic belongs in `framework/runners/`; case files carry none. When
  no existing runner fits, add a runner kind: a config interface plus a
  `BugCaseConfigByRunner` entry in `framework/types.ts`, and the implementation
  in `framework/runner-registry.ts`. Miss any step and `pnpm check:types`
  catches it.
- Browser runners share `framework/browser-runtime.ts`. They start Next.js
  lazily, reuse the seeded Nest session, and close Chromium before the backend
  app. Do not start a frontend or browser for API-only cases.

## 3. Data rules

- Keep data deterministic: expected values are pure functions of things like
  row number and revision, derived locally, so a rerun compares byte for byte.
  Shared formulas live in `framework/runners/` with a `.test.js` guarding the
  properties they carry (see `record-values.test.js` and its no-cell-survives
  test).
- Fixtures are built and cleaned up inside the case (table names carry the
  runId to avoid collisions). A failed cleanup is only a warning — that is the
  test's own housekeeping, not the product being wrong.

## 4. Verify

```bash
pnpm check                 # static chain; necessary for a PR, not sufficient
# local run (direction-finding): see .agents/skills/localrun/SKILL.md
# acceptance: dispatch e2e-lab.yml — GitHub Actions is the acceptance surface
```

A new case is not verified until it has been run against a commit from **before
its fix** and seen to reproduce there. A case that is green on every column
proves nothing, and it has happened here more than once: the first v2 cases ran
on v1, and a later one wrote the same value back where a real change was needed
and so never triggered a recompute. Treat all-green as a broken case until
proven otherwise.

## 5. Security boundary

This is a public repository. Security-sensitive bugs (privilege escalation,
injection, auth bypass, and the like) **do not land here before their fix
ships** — a `status: open` case is a working, public reproduction of an unfixed
vulnerability. After the fix ships they are accepted as `status: fixed`. The
rule lives in CONTRIBUTING.md; do not route around it.

## 6. Language

Everything committed here is in English — code, comments, docs, case titles,
and the strings the reports emit. `pnpm check:english` enforces it.
