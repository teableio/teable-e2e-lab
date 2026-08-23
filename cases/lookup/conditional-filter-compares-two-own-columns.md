# lookup/conditional-filter-compares-two-own-columns

**T6615** — fixed. The lead case of two on the
`conditional-filter-field-refs` runner; the sibling is
`lookup/conditional-filter-over-a-foreign-table`.

## What the user sees

A conditional lookup that never fills in, on a table that then stops keeping up
with edits. Both are the same failure: the computed run for that table dies
before it produces anything.

## Why

A conditional lookup matches rows by a condition instead of following a link,
and the condition can name a field rather than a constant — "where the other
table's reference equals this row's reference". Naming a column of the host
table on **both** sides is an ordinary thing to build: where these two columns
of mine agree.

The query builder swaps the two sides of a self-table field reference, so the
predicate probed the referenced column on the source alias, which does not
carry it: `column s.<name> does not exist`. That is classified as a code bug,
which means non-retryable — the whole computed run for the table dead-letters
on every recompute, not just the first.

## How the case is built

Entirely through the field editor. Nothing here is written with SQL, which is
what makes this shape worth guarding: a person can build it in the product in
under a minute, and the failure is silent.

Two rows, one whose keys agree and one whose keys differ. Both are needed —
with only matching rows, a lookup that matched nothing would look the same as
one that matched everything, and the case would pass on a build that returns
empty for every row.

## What the checkpoint asserts

The backfill lands with the right value on the matching row and nothing on the
other, and then an edit lands too. The second half matters: the report is about
every recompute dead-lettering, not only the first pass, and a fix that got the
backfill right while leaving recomputes broken would look correct after one
read.
