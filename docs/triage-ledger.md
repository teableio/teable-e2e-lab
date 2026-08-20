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

| commit      | issue | why not                                                                                                                                                                                                                                                                  |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `61ea0c646` | T6768 | The case was written and it passed on the fix's parent. The production failure came through the async schema-operation runner; a plain `POST /base/{id}/table` already answered 400 before the fix.                                                                      |
| `cfddb0057` | T6862 | Tried in two shapes, both green on the fix's parent: deleting a link field then its target (the optional link's FK is `SET NULL`, so the leftover column blocks nothing), and the same inside a duplicated base on the theory that the copied key came back `NO ACTION`. |
| `cfddb0057` | T6864 | Same two attempts as T6862 above — the two only reproduce together, and neither shape reproduced. T6863 from this same commit **is** covered, by `link/cross-base-link-clears-on-delete`.                                                                                |
| `529145a41` | T6849 | Performance shape — a set-based split falling back to per-row LATERAL. Belongs in the performance lab; conditional-rollup cases already live there.                                                                                                                      |
| `ca79dcb9c` | T6845 | Retry classification. The difference is how quickly a task dead-letters, which no HTTP response reports.                                                                                                                                                                 |
| `882651893` | T6809 | Defense-in-depth for T6807: a guard that throws at build time for a caller that does not exist. No user-visible path reaches it.                                                                                                                                         |
| `2ea2a0898` | T6810 | Resolves an internal accessor so it stops contradicting the physical schema. No behavior a request can see changed.                                                                                                                                                      |
| `f4770bb25` | T6853 | Needs a physical relation to be missing — reachable through `fixture-db` — but the repair only runs on schema-operation retry, so the assertion would be waiting on the async runner. Same trap as T6768.                                                                |
| `26f0d50c2` | T6823 | The reported symptom is a grid draw crash while formatting a cell. Server-side the same call is wrapped in a `try`/`catch` that falls back to display text, so the response does not change.                                                                             |
| `3ca7f727c` | T6830 | Observation is reachable, the trigger is not: it needs a computed plan already queued against a table that is then trashed.                                                                                                                                              |
| `1a074971d` | T6795 | Same shape as T6830 — a computed task already stuck when the table goes to trash.                                                                                                                                                                                        |

## Covered

Not listed here. A case's own `bug.sourceCommits` carries that, and duplicating
it in prose is how the two drift apart. To see it:

```bash
pnpm triage:covered
```
