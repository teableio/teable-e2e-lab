# filter/a-row-number-filter-typed-into-the-box

**T7071** — fixed. On the `autonumber-string-filter` runner.

## What the user sees

A view is filtered on the row-number column, "greater than 50". The filter
saves. The page then fails to draw — the row count behind it answers 500 — and
it fails the same way on every later visit, because the filter is stored on the
view and loaded again each time.

## Why

A filter box produces text. That is what the grid sends for numeric columns, and
every numeric column accepted it — except the row-number column, whose
comparison required an actual number and refused the string outright.

## What the checkpoint asserts

The row count comes back at all, and the rows behind it are the ones the filter
describes. Both, because the count and the listing are separate paths through
the same comparison: a count that answered a plausible number while the listing
disagreed would be a different bug still worth failing on.

The expected answer is derived from the numbers the product itself assigned,
not written into the case, so the case does not depend on how the row-number
column happens to start counting.

The fixture rejects a threshold that selects all the rows or none of them. A
filter that changes nothing cannot tell a comparison that ran from one that
never did.

The row-number column is added **after** the rows, which is how a table gets one
in practice: the column numbers what is already there.
