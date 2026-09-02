# lookup/y555-a-burst-of-new-rows-reaches-every-lookup

**T7002** — open. Fix candidate teable-ee#3207 (`98f225c53`, "bound inline
computed updates") shipped for this incident and does **not** close this
path: the case reproduces identically on the commit before it and on it.

## What the user sees

Rows imported in quick succession — a sync job, a script, paste-in-bulk —
into a table that other tables link to and look up. Every batch answers 201. Days later, some of the linked rows still show empty lookups and
formulas stuck on their no-value branch ("NO-…" where the data says
"YES-…"), while sibling rows written seconds apart are fine. Nothing
failed, nothing was reported, nothing is queued: the propagation for one
batch simply never happened.

This is the silent-data-loss face of the 2026-08-27 CN production
incident: the same base shape, the same write burst. The forensic
fingerprint is an empty `computed_update_outbox` next to
`computed:run:failed` / `computed_update.lock_unavailable` in the logs —
under the hybrid strategy (the production default) each batch's write
dispatches part of its computed propagation to the outbox ~50 ms later,
the dispatched task runs with `lockWait: false`, the NEXT batch's inline
run is already holding the per-table computed advisory lock
(`v2:computed:{tableId}`), and the loser's steps are dropped without a
surviving outbox row. Deterministic at this scale: the same burst loses
propagation every run.

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
batches, **paced** — each batch waits for a probe row to settle before the
next is sent — so the fixture cannot lose its own propagation to the bug
it exists to catch; a fixture that fails to settle is an error, not the
bug.

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

## Why the data is shaped this way

The loss needs three things at once, all from the incident: a computed
cascade per batch heavy enough that the inline run is still bounded and
work is dispatched (the 41-computed-field table with 18 reverse lookups
and the duplicate link doubling the edges), batches arriving while the
previous dispatch is in flight (back-to-back POSTs of 100), and cross-table
hosts whose staleness is observable as missing values rather than a value
diff (appending onto purification-free hosts). Shrinking the field families
or spacing the batches removes the race window and the case observes
nothing.
