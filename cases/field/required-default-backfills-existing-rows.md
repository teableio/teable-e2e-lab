# field/required-default-backfills-existing-rows

**T5685** — fixed. On the `required-default` runner; the shared design is
described in `record/default-fills-a-required-column-on-create`.

## This variant

The same wrong order, one step earlier: the column arriving rather than a
record. A required column with a default, added to a table that already holds
rows, was refused — the existing rows were checked against the constraint
before the default had been written into them.

From the field editor this is a dialog that will not close on a table with any
history at all, and the way out is to add the column without the requirement,
fill it, and then mark it required.

The fixture confirms the table holds a row before the column is added, because
the rows that are already there are what the constraint is checked against.
