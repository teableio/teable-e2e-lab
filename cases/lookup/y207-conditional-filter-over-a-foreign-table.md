# lookup/y207-conditional-filter-over-a-foreign-table

**T6599** — fixed. On the `conditional-filter-field-refs` runner.

## What the user sees

A conditional lookup that never fills in, on a table that then stops keeping up
with edits. Both are the same failure: the computed run for that table dies
before producing anything.

## Why

A conditional lookup matches rows by a condition instead of following a link,
and the condition can name a field rather than a constant. Here both sides name
a column of the table the lookup lives on, while the value comes from another
table.

The set-based field-reference fast paths resolve the filter's field against the
table being read from. A host-table field is not there, so SQL generation
failed with a bare `Field not found` and the computed run dead-lettered as an
obsolete plan — non-retryable, on every recompute.

Nothing here is written with SQL: the shape is built through the field editor,
which is what makes it worth guarding.

## The sibling that is not here

`bfe5599ed` (T6615) fixes the mirror image — a condition naming the _source_
table on both sides. It was built on this same runner and does not reproduce:
that condition selects every source row on the fix's parent and on `develop`
alike. It is recorded in `docs/triage-ledger.md`, and the runner keeps its
`sourceBothSides` shape so a future attempt starts from one config value.

The looked-up value lives on the source table here, so the recompute half of
the assertion edits the source row — the host's own columns are only the
condition.

## A measured surprise

A host-both-sides condition does not compare each row's own two columns. On
`develop` it matched **every** host row, including the one whose two keys
differ — measured in run 32655175261, where the first version of this case
expected the non-matching row to read empty and failed for that reason.

So the fixture uses exactly one source row and asserts every host row reads its
value. Whether matching every row is the intended reading of such a condition is
a question this case does not answer; it records what the fixed build does.

On the fix's parent `ae1e2b086` every host row read empty instead — nothing
computed at all, which is the failure this case is about.
