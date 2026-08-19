---
name: localrun
description: Operate local e2e-lab bug-regression runs, including teable-ee sandbox refresh, e2e-lab injection, quick local verdict checks, and GitHub Actions acceptance. Use when the user mentions e2e-lab, bug regression cases, local teable-ee injection, refreshing teable-ee for bug tests, or validating a bug case before GitHub Actions.
---

# Teable e2e-lab local runs

## Model

`e2e-lab` is the source of truth for bug cases, runners, verdicts, reporting,
registry, and workflow orchestration. `teable-ee` is the runtime harness. Do
not edit or commit `teable-ee` for e2e-lab case work unless the user explicitly
asks.

Local runtime checks are direction-finding only; GitHub Actions is the
acceptance surface.

## Paths

Keep machine-specific paths out of tracked files. Configure them in this
repository's local Git config, which lives in `.git/config` and is never
committed:

```bash
git config --local e2eLab.teableEeMain /path/to/teable-ee
git config --local e2eLab.teableEeSandbox /path/to/teable-ee-e2e-local
```

The helper scripts resolve paths in this order: environment variable, local Git
config, then a clear configuration error.

## Prerequisites: Local Docker Services

The e2e harness requires Postgres and Redis running locally. Always check
before attempting a run:

```bash
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Required: `teable-postgres` (postgres:15.4, port 5432) and `teable-cache`
(redis:7.2.4, port 6379). If missing, the easiest bring-up is from the sandbox:

```bash
cd "$(git config --local --get e2eLab.teableEeSandbox)"
echo "1" | make switch-db-mode
```

That creates the network, starts both containers, runs Prisma generate +
migrate deploy, and writes connection strings into the env files. On a fresh
database also run the e2e seed (it creates the `test@e2e.com` user, space, and
base the harness relies on):

```bash
NODE_ENV=test pnpm -F @teable/db-main-prisma-ee prisma-db-seed -- --e2e
```

Prisma `Invalid value` / `Unknown field` errors during a run mean the client or
schema drifted from the sandbox's code — rerun `pnpm install` and
`echo "1" | make switch-db-mode` in the sandbox.

## Quick Start

From the e2e-lab repo:

```bash
pnpm check
.agents/skills/localrun/scripts/refresh-teable-ee-sandbox.sh
.agents/skills/localrun/scripts/inject-e2e-lab.sh
```

Then run a case inside the sandbox:

```bash
cd "$(git config --local --get e2eLab.teableEeSandbox)/enterprise/backend-ee"

E2E_LAB_CASE_FILTER=<case-id> \
\
NODE_OPTIONS='--max-old-space-size=4096' \
npx vitest run --config ./vitest-e2e-lab.config.ts
```

Useful env knobs:

- `E2E_LAB_CASE_FILTER`: case id, comma list, or `all` (default all).
- `E2E_LAB_GATING=false`: observe without enforcing `bug.status` — what CI sets
  on every historical column. Local default is `true` (enforce).
- `E2E_LAB_ARTIFACT_DIR=/tmp/e2e-lab-artifacts`: write the verdict payloads
  somewhere inspectable instead of console-only.

## Acceptance

Dispatch the real run with the commits to compare, oldest first (the last one
is the gating column):

```bash
gh workflow run e2e-lab.yml \
  --repo teableio/teable-e2e-lab \
  --ref main \
  -f teable_ee_commits="<older-sha>,<newer-sha>,develop" \
  -f case_filter=all
```

Read the bug × commit table in the report job's summary; download
`e2e-lab-comparison-<run>-<attempt>` for the JSON.

## Guardrails

- Do not claim runtime acceptance from `pnpm check`; it is source validation
  only.
- The sandbox may be reset to `origin/develop`; do not inject into a dirty
  daily-development `teable-ee` checkout unless the user explicitly asks.
- Keep generated local artifacts and injected files out of e2e-lab commits.
- A 💡 unexpected-pass wants a human to confirm the fix and flip `bug.status`
  to `fixed` — never flip it just to quiet the notice.
