# view/y3371-a-view-that-hides-nothing-shows-new-columns

**T8058** — fixed in `c609d41b1`.

## What the user sees

A colleague adds a column; it appears in their view but never in another view that hides nothing.

## What the checkpoint asserts

A column created from the second view is not hidden in the first view, where a column was hidden and shown again.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with two grid views. In the first, a column is hidden and then shown again, so that view hides nothing.
