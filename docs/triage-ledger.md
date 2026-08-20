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

## Covered

Not listed here. A case's own `bug.sourceCommits` carries that, and duplicating
it in prose is how the two drift apart. To see it:

```bash
pnpm triage:covered
```
