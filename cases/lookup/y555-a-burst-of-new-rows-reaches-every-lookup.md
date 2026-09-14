# lookup/y555-a-burst-of-new-rows-reaches-every-lookup

**T7002** incident regression — fixed by **T7152**,
[teable-ee#3337](https://github.com/teableio/teable-ee/pull/3337)
(`3c98735f5`, "preserve continuation progress and gate convergence").
The original incident fix, teable-ee#3207 (`98f225c53`, "bound inline
computed updates"), bounded target scans but did not close this propagation
path. The case keeps T7002 as its incident identity and records #3337 as its fix.

## What the user sees

Rows imported in quick succession — a sync job, a script, paste-in-bulk —
into a table that other tables link to and look up. Every batch answers 201. Days later, some of the linked rows still show empty lookups and
formulas stuck on their no-value branch ("NO-…" where the data says
"YES-…"), while sibling rows written seconds apart are fine. Nothing
failed, nothing was reported, nothing is queued: the propagation for one
batch simply never happened.

The fixture preserves the dependency shape and write burst from the
2026-08-27 CN incident. Earlier investigation associated stale hosts with
`computed_update.lock_unavailable`, but lock contention alone does not prove
that an outbox task was discarded: lock-miss retry handling predates the
failing revisions below.

The verified fix boundary is #3337's continuation-integrity change. It
normalizes deferred INSERT work to UPDATE semantics, preserves ledger inputs
for deferred same-record steps as well as edges, and carries partial-stage
boundaries through persisted tasks. These prevent a completed sibling stage
from losing the inputs or execution boundary needed by later host computation.
The API comparison identifies the fixing commit; it does not isolate which
individual hunk is sufficient for this fixture.

## Why the case runs in a hybrid invocation

teable-ee's e2e setup pins `V2_COMPUTED_UPDATE_MODE=sync`, under which this
operation is healthy (~13 s to full convergence at this scale) and the bug
cannot exist — the dispatch seam it lives in is not there. The case
declares `computedUpdateMode: "hybrid"`, the workflow runs it in a
separate vitest invocation whose app boots with the variable unset (hybrid
is the unset default; the env schema accepts only `sync`), and the runner
refuses to observe anything if the invocation is not actually hybrid.

## The fixture

The incident base's dependency shape, field-for-field (counts guarded by
`framework/runners/circular-append-burst-workload.test.js`):

- `plasmid`: 3 rows, 16 fields — conditional-lookup source keyed by
  `type_key`.
- `orders`: 6,000 rows, 34 fields, 6 own-field formulas.
- `sub-orders`: 3,000 rows, 85 fields (24 computed) — 4 links, including
  **two duplicate one-many links to `purification`**, 6 order lookups, 3
  conditional plasmid lookups, 7 purification lookups (one pulling a
  Purification _formula_), 8 formulas. `so_is_expressible` is the
  incident's signature field: `IF({lu_p_batch_code}, "YES", "NO") & …`.
- `purification`: 500 rows, 88 fields (41 computed) — 18 reverse lookups
  into `sub-orders` split across the two symmetric backref links,
  8 plasmid lookups, 1 order lookup, 14 formulas. `lu_so_expression_card`
  looks up the SubOrders formula and `p_chain_card` sits on top of it,
  closing the circle SubOrders ⇄ Purification.

Row mappings are permutation-deterministic and injective, so every
purification row has exactly one host sub-order and every cell value is a
pure function of row numbers. Seeding goes through the public API in
batches, **paced** — every row and its host must settle before the next
batch is sent. A single probe cannot prove the previous batch's remaining
outbox work is finished. This keeps the fixture from triggering the race it
exists to catch; a fixture that fails to settle is an error, not the bug.

## What the checkpoint asserts

Append 400 new purification rows (p = 501..900, extending the same
permutation onto previously purification-free hosts) in four back-to-back
batches of 100, every row wiring all four link cells. Then, within a
bounded five-minute window, poll through the real read path until:

- **every** one of the 400 host sub-orders exposes the complete
  post-append state — all 7 purification lookups and the formulas over
  them (`so_expression_card`, `so_is_expressible` flipping to "YES-…");
- **every** appended purification row exposes its own 41 computed fields,
  including the circle-closing `p_chain_card`.

Polling waits for values, so asynchronous outbox convergence passes;
silently dropped propagation cannot. The timeout is the assertion, and the
failure message names the stale rows with expected versus actual values.
Hosts start verified purification-free, so "the lookup arrived" cannot be
a leftover.

## Verified fix boundary

On 2026-09-14, [run 34793682836](https://github.com/teableio/teable-e2e-lab/actions/runs/34793682836)
ran the unchanged case using lab `877a500f` against four EE revisions:

| EE revision                 | Observation                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `df17b760b5`                | Bug present: 300 of 400 hosts still stale after 300 seconds |
| `ffa4023023` (#3337 parent) | Same 300 stale hosts after 300 seconds                      |
| `3c98735f5f` (#3337)        | All hosts and appended rows converged in 17.593 seconds     |
| `2d637d0677`                | All hosts and appended rows converged in 18.184 seconds     |

[Independent repeat 34793743881](https://github.com/teableio/teable-e2e-lab/actions/runs/34793743881)
on `2d637d0677` converged in 12.588 seconds. These artifacts still declare
`open`, so successful observations are labeled `unexpected-pass`; this
metadata correction makes the same absent observation a `pass` and a future
reproduction on the gating revision a `regression`.

To repeat the boundary check with authenticated GitHub CLI access:

```bash
gh workflow run e2e-lab.yml --repo teableio/teable-e2e-lab --ref main \
  -f teable_ee_commits=ffa4023023e122fed546181968840b02fa4941e6,3c98735f5f5a63ab0d20d5f8012e514fdae58093 \
  -f case_filter=lookup/y555-a-burst-of-new-rows-reaches-every-lookup
```

Acceptance requires `observed=present` at
`every-appended-rows-host-converges` on the parent and `observed=absent`
on the fix, with no setup errors or missing payloads. A timeout on the fix
is a failure. This verifies isolated synthetic fixtures, not deployed
customer data or repair of historical stale values.

## Why the data is shaped this way

Keep the wide computed cascade, duplicate links, back-to-back batches and
previously purification-free hosts together. They exercise staged cross-table
propagation and make missing results observable independently of queue state.
Do not shrink the fixture or pace the append burst when maintaining this case:
the before/after evidence above applies to the full operation.
