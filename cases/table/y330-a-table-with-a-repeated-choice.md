# table/y330-a-table-with-a-repeated-choice

**T3401** — fixed.

## What the user sees

A table that will not open. Not a column, not a row — the whole table, for
everyone, with an error that says nothing a user could act on.

The cause is invisible from the interface: the column's stored settings list
the same choice twice. Nobody sets that up on purpose; it is what an import
that ran twice, a merged option list or a migration leaves behind, and the
dropdown just looks like it has a repeated entry.

## What the checkpoint asserts

The table opens **and** returns the rows it holds. A read that answered with an
empty list would be a different failure with the same appearance.

## What the fixture has to hold

The table is read once before the settings are damaged, so a failure afterwards
is the duplicate rather than the table.

The duplicate is written with SQL: the product refuses to create one, which is
exactly why nobody can clear it from the interface either.
