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

## Why there have to be this many rows

The delete walks the table in batches of 5000. A stalled offset only shows when
the walk has to cross from one batch into the next, so a table that fits in one
batch is green on both sides — eight rows was, on the fix's parent and on
develop alike (run 34575930130). The row count is a config value for exactly
that reason.

## Why the kept rows have to be early

The rows are deleted in batches that walk the table by position. A row being
kept was passed over without the position moving past it, so the next batch
started where the previous one did and the walk stopped early. A kept row at the
end of the table would not stall anything; one early in it stalls everything
after it. The runner refuses a fixture that keeps nothing.

## How the case is built

5200 rows, two of them unselected — positions 3 and 1500 — and one delete request
carrying no list of rows at all, only the two to exclude: the rows are then
whatever the current scope holds minus those, which is what the click sends.

A refusal that is a validation error is reported as the case sending the wrong
shape rather than as the product deleting the wrong rows. That distinction was
bought once: an earlier attempt put the excluded ids at the top level instead of
inside `selection` and both columns went red for it (run 34575590980).

## What the checkpoint asserts

What is left is exactly the two rows that were unselected, compared by name.
Both directions matter and are reported differently: rows nobody unselected
still being there is the fault; unselected rows being deleted anyway would be a
worse one.

## Limits

One table size and one pattern of kept rows. How many batches the walk takes
depends on the batch size the product chooses, so a larger table exercises more
of the walk than this one does.
