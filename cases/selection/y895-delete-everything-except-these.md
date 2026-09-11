# selection/y895-delete-everything-except-these

**T6074** — fixed.

## What the user sees

A table cleared out the ordinary way — select all, click off the few rows worth
keeping, delete — and some of the rows that were selected are still there.

Nothing reports a failure. A count of what was deleted comes back, and it is
lower than the number of rows selected; but somebody who has just cleared a
table is looking at the table, not at a count.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why the kept rows have to be interleaved

The rows are deleted in batches that walk the table by position. A row being
kept was passed over without the position moving past it, so the next batch
started where the previous one did and the walk stopped early. A kept row at the
end of the table would not stall anything; one early in it stalls everything
after it. The runner refuses a fixture that keeps nothing.

## How the case is built

Eight rows, two of them unselected — positions 1 and 4 — and one delete request
that says "all rows, except these two", which is literally what the request
carries.

## What the checkpoint asserts

What is left is exactly the two rows that were unselected, compared by name.
Both directions matter and are reported differently: rows nobody unselected
still being there is the fault; unselected rows being deleted anyway would be a
worse one.

## Limits

One table size and one pattern of kept rows. How many batches the walk takes
depends on the batch size the product chooses, so a larger table exercises more
of the walk than this one does.
