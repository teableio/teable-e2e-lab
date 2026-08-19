# Contributing

## What a case must be

- **One bug, one case.** The case reproduces a specific reported bug (or is a
  `sentinel/` case guarding currently-correct behavior). The `.md` beside it
  names the issue, the reproduction, and what the checkpoint asserts — written
  for someone reading it six months from now.
- **Public API only.** Cases exercise the product the way users reach it. No
  database access, no internal imports beyond what the e2e harness provides.
- **Deterministic data.** Expected values are pure functions of row numbers and
  revisions, derived locally, so a rerun is byte-comparable. Load-bearing data
  properties get their own test (see
  `framework/runners/record-values.test.js`).
- **Checkpoint discipline.** Setup and fixture verification stay outside
  `bugCheckpoint()`; the observation of the bug goes inside. That boundary is
  what separates ❌ "bug present" from 💥 "case broken" in the comparison
  table, and reviews will hold the line on it.
- `pnpm check` must pass. It is source validation only — a maintainer runs the
  real acceptance by dispatching `e2e-lab.yml`.

## Security-sensitive bugs

This repository is public. A `status: open` case is a working, public
reproduction of an unfixed vulnerability — so:

- Bugs with security impact (privilege escalation, injection, auth bypass,
  data exposure, SSRF, and the like) are **not accepted until the fix has
  shipped**, and then only as `status: fixed`.
- If you believe you have found a security issue, report it through Teable's
  security disclosure channel, not here.
- Maintainers will close PRs that violate this without debating severity in
  public.

## Fork PRs and CI

Fork PRs run the secrets-free `Static checks` workflow only. The actual
regression run needs the private teable-ee access token, which fork PRs are
never handed — a maintainer dispatches `e2e-lab.yml` to verify your case
against real revisions before merging. Include in your PR description which
commit the bug reproduces on (and which fixed it, if known), so that dispatch
is a copy-paste.

## Never in this repository

- Credentials of any kind, including "temporary" ones in test data.
- Internal URLs, customer names, or data lifted from production.
- Real user content in fixtures — generate everything.
