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
and the condition can name a field rather than a constant. Here both sides name
a column of the table being read from: where those two columns of the source
agree.

The query builder swaps the two sides of a same-table reference, so the
predicate probed the referenced column on the source alias, which does not
carry it: `column s.<name> does not exist`. That is classified as a code bug,
which means non-retryable — the whole computed run for the table dead-letters
on every recompute, not just the first.

## How the case is built

Entirely through the field editor. Nothing here is written with SQL, which is
what makes this shape worth guarding: a person can build it in the product in
under a minute, and the failure is silent.

Two source rows, exactly one of which has agreeing keys. Both are needed — with
only matching rows, a lookup that matched everything would look the same as one
that matched correctly, and the assertion is precisely that the host rows show
the matching row's value and not the other's.

## What the checkpoint asserts

The backfill lands the matching source row's value on every host row, and then
an edit to that source row lands too. The second half matters: the report is about
every recompute dead-lettering, not only the first pass, and a fix that got the
backfill right while leaving recomputes broken would look correct after one
read.

## A first shape that did not build

The first version put the lookup's source table and the condition's two columns
all on the host table itself. Both columns errored at field creation with
`column h.Left_Key does not exist` — including `develop`, so it was not a
reproduction of anything; that shape simply is not one the product builds. Run 32655173550.
