# Triage ledger

Commits that were examined as case candidates and **deliberately not turned
into one**, with the reason.

This is the negative half of an answer the repository already gives in
positives: a case declares the teable-ee commits it settles in
`bug.sourceCommits`, and those two lists together are what lets the next
triage pass skip what has already been decided and spend its time on what has
not.

The negatives are the expensive half. A commit that produced a case announces
itself; a commit that was read, reasoned about, tried, and rejected leaves no
trace at all, so the next pass re-derives the same conclusion at the same cost
— and the more careful the rejection was, the more expensive it is to repeat.
Three of the rows below cost a CI matrix run each to establish.

A row here is a decision, not a verdict on the fix. "Not taken" means this
repository cannot express the case honestly today; if that changes — a new
seam, a different observation point — delete the row and write the case.

A row is one commit and one issue, because a commit can be both: `cfddb0057`
fixed three issues, one of which is a case here and two of which are rows
below. `pnpm check` refuses the same commit-and-issue pair appearing in both
places — it cannot be settled and skipped at once.

## Not taken

| commit       | issue | why not                                                                                                                                                                                                                                                                            |
| ------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `61ea0c646`  | T6768 | The case was written and it passed on the fix's parent. The production failure came through the async schema-operation runner; a plain `POST /base/{id}/table` already answered 400 before the fix.                                                                                |
| `cfddb0057`  | T6862 | Tried in two shapes, both green on the fix's parent: deleting a link field then its target (the optional link's FK is `SET NULL`, so the leftover column blocks nothing), and the same inside a duplicated base on the theory that the copied key came back `NO ACTION`.           |
| `cfddb0057`  | T6864 | Same two attempts as T6862 above — the two only reproduce together, and neither shape reproduced. T6863 from this same commit **is** covered, by `link/cross-base-link-clears-on-delete`.                                                                                          |
| `529145a41`  | T6849 | Performance shape — a set-based split falling back to per-row LATERAL. Belongs in the performance lab; conditional-rollup cases already live there.                                                                                                                                |
| `ca79dcb9c`  | T6845 | Retry classification. The difference is how quickly a task dead-letters, which no HTTP response reports.                                                                                                                                                                           |
| `882651893`  | T6809 | Defense-in-depth for T6807: a guard that throws at build time for a caller that does not exist. No user-visible path reaches it.                                                                                                                                                   |
| `2ea2a0898`  | T6810 | Resolves an internal accessor so it stops contradicting the physical schema. No behavior a request can see changed.                                                                                                                                                                |
| `f4770bb25`  | T6853 | Needs a physical relation to be missing — reachable through `fixture-db` — but the repair only runs on schema-operation retry, so the assertion would be waiting on the async runner. Same trap as T6768.                                                                          |
| `26f0d50c2`  | T6823 | The reported symptom is a grid draw crash while formatting a cell. Server-side the same call is wrapped in a `try`/`catch` that falls back to display text, so the response does not change.                                                                                       |
| `3ca7f727c`  | T6830 | Observation is reachable, the trigger is not: it needs a computed plan already queued against a table that is then trashed.                                                                                                                                                        |
| `1a074971d`  | T6795 | Same shape as T6830 — a computed task already stuck when the table goes to trash.                                                                                                                                                                                                  |
| `82c7bcb94c` | T6865 | Overrides the response content type on presigned downloads for the s3, aliyun and minio adapters. The lab runs with the default `local` storage provider, so none of those three code paths is reached and the presigned URL the case would read is built somewhere else entirely. |
| `161e960c71` | T6821 | Sargability. The behavior is identical either way; what changed is whether an index can be used, measured in the commit as 260s against 14ms for a 500-row batch. Belongs in the performance lab, next to the conditional-rollup cases.                                            |
| `aea53eec6b` | T6815 | Request-scoped caching of a table aggregate on write paths. Same responses, fewer rebuilds - there is no response for a case to tell apart.                                                                                                                                        |
| `4087dad967` | T6883 | A subscription-level filter in a browser hook that made free spaces invisible to the base-generation flow. Nothing server-side changed, so no request answers differently.                                                                                                         |
| `a9f56d9d51` | T6765 | Written and run: converting a number column into a lookup of a foreign formula completes correctly on the fix's parent, at 1 row and at 40, in about a second. See the note below this table.                                                                                      |
| `e94ae6db28` | T6767 | Written and run: a formula over a lookup of a link field stored in a leftover TEXT column backfills correctly on the fix's parent. Same note.                                                                                                                                      |
| `228be9ffa7` | T6770 | Written and run: a lookup of a link field added to a host whose rows are already linked seeds correctly on the fix's parent. Same note.                                                                                                                                            |
| `ccc43864e`  | T6406 | Written in three shapes. A conditional rollup cannot be created through the public field API at all - it refuses a rollup with no link field - and the conditional lookup that can be created propagates correctly on the fix's parent. See the note below.                        |
| `45828597b`  | T6524 | Written and run three times. The last shape proved the observation is unavailable here: editing a cell writes no record history in this environment at all, within 60 seconds, so "the import wrote none" cannot be told from "nothing writes any". See the note below.            |
| `dfe6a1ebc`  | T6614 | Written in three shapes and run three times, green on both columns each time. The dangling reference a `deleted_time` fixture produces does not reach the SQL builder the fix changes. See the note below the table.                                                               |
| `bfe5599ed`  | T6615 | Written and run: a conditional lookup whose condition compares two columns of its source table selects every source row on the fix's parent and on `develop` alike, so the two columns are indistinguishable. See the note below the table.                                        |
| `c0ffdb358`  | T6511 | Written and run: clearing a filled text cell with typecast already stored `null` on the fix's parent, so the case is green on both columns. Run 32656127300.                                                                                                                       |
| `175d1de3f`  | T6728 | Written in three shapes and run three times. Every trigger a small fixture can reach through the public API computes inline, and inline compute fails closed identically on both sides of the fix. See the note below the table.                                                   |

### The three computed-backfill rows

All three are the same failure: a computed backfill whose SQL assignment
disagrees with the physical type of the column it lands in, killing the
`table.update` schema operation it runs inside. All three were built as cases
on a shared runner, and all three were green on every column of every run.

The rejection is not "the failure was invisible to the cases". It is stronger
than that, and it took three runs to establish:

1. **Four shapes, ten green pre-fix columns.** A number column converted into a
   lookup of a foreign formula; a formula over a lookup stored in a leftover
   text column; a lookup of a link field added to a host whose rows were
   already linked; and a lookup that had already computed, repointed from a
   date field to a text one. Runs 32395244311, 32395779980 and 32397534038.
2. **Batch size is not the variable.** These backfills are written as one
   `UPDATE ... FROM SELECT`, so a one-row fixture is what a per-row fast path
   would answer instead. Forty rows per shape changed nothing.
3. **The precondition is never built.** A probe read the stored
   `db_field_type` and the physical column type together, on the fix's parent,
   after each sequence. They agree every time — `REAL`/`double precision`,
   `JSON`/`jsonb`, `TEXT`/`text`, and `TEXT`/`text` again after the repoint
   that was expected to leave `DATETIME` behind.

So the drift these fixes are about does not happen here. Field conversion
through the public API re-derives `db_field_type` from the resulting shape; the
unconditional copy the fix removed is in the v2 core's own rebuild path, which
these requests do not take. The cases were watching a state that was never
there, on either side of the fix.

The work is kept rather than thrown away: branch
`attempt/computed-backfill-recast-green-everywhere`, unmerged, carrying the
four shapes, their fixture checks and the type-agreement probe. If a seam
appears that drives the conversion the way the v2 container does, start there —
the fixtures are correct, they simply have nothing to catch.

### The oversized-computed-cell row

The change isolates a computed cell that is over the 262144-byte ceiling
instead of failing the task it belongs to. Before it, one row whose formula
result was too big took every other row recomputing in the same pass down with
it — a real failure, and a legible one: the write answers 200 and the
neighbouring cells simply stop updating.

Three shapes were built and run. None of them reached the code the fix
changes, and each failed to for a different reason worth writing down, because
each looks like the obvious way to write this case:

1. **Creating the formula field last**, so the creation backfill computes every
   row. Green on both columns: it stored a 300000-byte computed cell on the
   fix's parent as well as on `develop`. The ceiling is enforced in the
   pipeline's record-change path, and the backfill never consults it. Run 32649775516.
2. **A bulk write on the table the formula lives on.** Red on both columns, and
   red at the write itself, which was refused with the data-safety error. That
   compute runs inline, and inline compute fails closed by design — the change
   says so in as many words.
   Run 32650260500.
3. **The formula in a second table, reading the first through a link**, on the
   theory that a recompute past the first dependency level is handed to the
   outbox worker. Red on both columns again, the same refusal at the same
   place. Run 32650718295.

The isolation belongs to the async worker: it is the only caller that asks for
it. So a case has to make the recompute go to the worker, and the one route
left is volume — the inline path is capped at 2000 dirty rows per table, so a
fixture would have to dirty more than that in one write and then wait out a
real worker pass. That is a different class of fixture from anything here
today, and it is where the next attempt should start rather than reshaping the
small ones again.

The three shapes are kept on branch `case/computed-oversized-cell`, unmerged.

### The dangling-computed-source row

The change degrades a rollup or lookup whose aggregation source field was
deleted without the dependent being marked broken - the residue of older delete
paths - instead of failing SQL generation with "Field not found" and killing
the whole computed task. That is a real and legible failure: the task is per
table, so one unmarked column stops every other computed column on it.

The fixture is the problem. Marking the source field's `deleted_time` is what
the old delete path left behind in the database, but it is not enough to make
the current builder reach for it, and three triggers were tried:

1. **A plain text edit on the dependent table.** Green on both columns - run 32654069014. Editing a text field queues no recompute involving the lookup
   at all.
2. **A healthy formula on the same table, edited into recomputing.** Green on
   both columns - run 32654350507. The healthy column recomputed on its own;
   the lookup's SQL was never generated.
3. **Touching the source row first, then the dependent.** Green on both columns
   - run 32654659137. The lookup still read its old value, so the plan did not
     consult the deleted field even then.

What the third run shows is the informative part: after the source field is
marked deleted, the lookup goes on answering its previous value. So the plan
this fixture produces is not the plan the fix repairs - either the dependency
graph is resolved from somewhere the fixture did not touch, or a real
occurrence needs the field row gone rather than tombstoned.

The next attempt should start by making a lookup actually fail SQL generation -
confirm the "Field not found" error can be produced at all - before building a
case around surviving it. The three shapes are kept on branch
`case/dangling-computed-source`, unmerged.

### The self-referencing conditional filter row

The change is about a conditional lookup whose filter names a column of the
table being read from on both sides of a field reference. Before it, the
builder swapped the two sides and probed the referenced column on the source
alias, answering `column s.<name> does not exist` and dead-lettering the
table's whole computed run.

Two shapes were built:

1. **Source table, condition, and lookup value all on the host table.** Errored
   at field creation on both columns — `column h.Left_Key does not exist`,
   `develop` included. The product does not build that shape at all, so it
   reproduces nothing. Run 32655173550.
2. **A source table with two key columns, the condition comparing them.** Red on
   both columns for the same reason: the lookup returned the values of _every_
   source row, the non-matching one included, on the fix's parent and on
   `develop` alike. Run 32655607286.

The second result is what closes it for now: on this fixture the condition is
not a row filter on either side of the fix, so there is nothing for a case to
tell apart. Either the filter needs a shape this attempt did not find, or the
production occurrence carries persisted filter state that the field editor does
not produce.

The sibling fix `3eff0a100` (T6599), whose filter names the _host_ table on
both sides, does reproduce and ships as
`lookup/conditional-filter-over-a-foreign-table`. Its runner still supports the
source-side shape, so a future attempt starts by changing one config value.

### The import-record-history row

The change stops an import writing one record-history entry per non-empty
cell. Creating a row through the product writes none - a new row has no
previous value - and an import is creating rows, so a 10000 x 20 sheet was
200000 entries nobody asked for.

Three shapes:

1. **In-place import into an existing table.** Green on both columns - run 32656953918.
2. **The create-table import, the handler the fix names.** Green on both
   columns again - run 32657518939.
3. **The same, with a positive control added first: edit a cell and require an
   entry to appear.** The control fires on both columns - runs 32657904880 at
   15 seconds and 32658159664 at 60. Record history is not written in this
   environment at all.

The third shape is what makes the first two meaningless rather than
encouraging: "the import wrote no history" is satisfied just as well by nothing
writing any, and a case built on it would pass on every commit forever.

Whether history is off by configuration, gated to an edition, or written by a
worker this lab does not run is not established here. Settling that is where
the next attempt starts, and until it is settled no assertion about record
history can be trusted in this repository - including in cases that would use
it only incidentally.

The three shapes are kept on branch `case/import-record-history`, unmerged. The
positive control in it is worth reading first: it is the part that turned two
silent greens into a finding.

### The conditional-summary propagation row

The change makes a write dirty the filtered summaries that depend on it. The
failure it fixes is legible and worth guarding: a summary that counts only some
rows keeps its old number after one of those rows changes, with the write
answering 200 and the source row showing the new value.

Three shapes, and the first two are about the API rather than the bug:

1. **A conditional rollup with the aggregation in the lookup options.** Both
   columns answered `Unrecognized key: "rollupExpression"` - run 32659440769.
2. **A conditional rollup with the aggregation in `options.expression`.** Both
   columns answered `LinkFieldId is required when isLookup attribute is true or
field type is rollup` - run 32659721790. The public field API has no shape
   for a rollup that reaches another table by condition instead of by link.
3. **A conditional lookup of the same column**, which the public API does
   accept, showing the matching values rather than their total. Green on both
   columns: the values follow the change on the fix's parent already - run 32660089795.

So the summary this change is about is built through the v2 container's own
field API, which the product's e2e suite uses and this lab does not. What the
public API can build propagates correctly either way.

The next attempt needs either a public shape for a conditional rollup - if one
appears, this becomes a one-line config change on the runner, which is kept -
or a reason to believe the lookup path can be made to fail. The runner is on
branch `case/conditional-rollup-propagation`, unmerged.

## Covered

Not listed here. A case's own `bug.sourceCommits` carries that, and duplicating
it in prose is how the two drift apart. To see it:

```bash
pnpm triage:covered
```
