# record/y244-edit-a-cell-behind-a-generated-formula

**T5481** — fixed.

## What the user sees

A row that cannot be changed. Not the formula column — the ordinary column
beside it, the one they are trying to correct. The message names a column they
never touched.

Which tables this happens on is invisible from the product: only those carried
over from an older version store their formula columns as something the
database works out itself.

## Why

The product recalculates a formula column by writing the new value into it. On
that storage the database owns the column and refuses the write, and the edit
that triggered the recalculation is refused with it.

## What the checkpoint asserts

The edit lands **and** the worked-out column has followed it. Skipping the
write is only correct because the database does the same work; a version that
skipped it and left the column stale would be a quieter version of the same
problem.

## What the fixture has to hold

Both halves of the older storage, written as setup before the checkpoint: the
product's own bookkeeping marking the column as one the database maintains, and
the physical column actually generated. Either alone would not reproduce what a
migrated table carries.
