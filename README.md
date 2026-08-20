# e2e-lab

Bug regression comparison for [Teable](https://teable.io): give it a list of
teable-ee commits, it runs the same bug cases against every one of them and
answers, in a single table, "is this bug still there on this revision" — so you
can see at a glance which two revisions a fix landed between, and whether
anything that was fixed has come back.

```
| case              | issue | status | `3f2a1c` | `8b4e77` | `a1c9f0` | transition               |
| record/t1481-...  | T1481 | fixed  |    ❌    |    ❌    |    ✅    | fixed 8b4e77..a1c9f0     |
| record/t1502-...  | T1502 | open   |    ⬜    |    ⬜    |    ⬜    |                          |
| field/t1520-...   | T1520 | fixed  |    ✅    |    ✅    |    ❌    | regressed 8b4e77..a1c9f0 |
```

## How it works

The execution skeleton is teable-perf-lab's, proven in production there:

- **Injection**: this repository's `cases/`, `framework/`, `registry.ts`, and
  spec are copied into a `teableio/teable-ee` checkout and run through
  teable-ee's own e2e harness (vitest, `initApp()`, seeded auth). Cases live
  here and evolve independently; historical commits of the product need no
  knowledge of them.
- **Pinning**: refs are resolved to SHAs once, up front; every job checks out
  the pinned SHA.
- **One job per commit**: isolated database built from that commit's own
  migrations, all selected cases run serially, and confirmed frontend cases
  lazily start Next.js plus headless Chromium. One JSON payload per case
  written _before_ any assertion throws — the payloads are the source of
  truth, and failures carry the server's own error body.
- **Fail-closed report**: every planned (case × commit) cell must have exactly
  one payload. Missing evidence fails the run; it never renders as an empty
  cell someone might read as green.

What is this repository's own: the verdict model. Each case declares the bug
it reproduces and its believed status (`open` / `fixed`); the run observes
(`absent` / `present` / `error`) and the comparison judges. Known-unfixed bugs
failing is expected and green; a fixed bug reproducing on the **gating column**
(the newest commit) is a regression and red; the same observation on an older
column is just the world before the fix. A case that errors is red everywhere,
because it observed nothing. Details: [framework/verdict.ts](framework/verdict.ts)
and [docs/operations/e2e-lab.md](docs/operations/e2e-lab.md).

## Running

```bash
gh workflow run e2e-lab.yml \
  --repo teableio/teable-e2e-lab \
  --ref main \
  -f teable_ee_commits="<sha-before-fix>,<sha-after-fix>,develop" \
  -f case_filter=all
```

Commits go oldest-first; the last one is the gating column. The table lands in
the report job's GitHub summary; `comparison.json` in the
`e2e-lab-comparison-*` artifact. Local direction-finding runs:
[.agents/skills/localrun/SKILL.md](.agents/skills/localrun/SKILL.md).

## Adding a case

Read [.agents/README.md](.agents/README.md) — the short version: one
declarative `cases/<group>/<name>.case.ts` (data only, typed against its
runner), one same-name `.md` documenting the bug and the checkpoint, one
registry entry. Execution logic lives in `framework/runners/`. `pnpm check`
validates everything that can be validated without a teable-ee checkout,
including a full type check against the runner/config contracts.

Security-sensitive bugs are not accepted until their fix has shipped — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

```
cases/            declarative bug cases + per-case docs
framework/        types, verdict model, checkpoint seam, runners, artifacts
registry.ts       explicit case registration
e2e-lab.e2e-spec.ts   the single injected entry point
scripts/          planner, comparison table, acceptance gate, checks
.github/          e2e-lab.yml (the run), check.yml (secrets-free PR checks)
docs/             operations guide, cross-repo dispatch status
```
