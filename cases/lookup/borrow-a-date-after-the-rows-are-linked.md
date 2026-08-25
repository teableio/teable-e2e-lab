# lookup/borrow-a-date-after-the-rows-are-linked

**T6734** — fixed.

## What the user sees

A borrowed date column that stays empty.

The order of work is the ordinary one: set up the link first, because that is
the part people think about, then add the small column that borrows a date
across it once the rows are already connected.

Added that way the column came back empty on every row — not wrong, empty —
with the date sitting one table away and the link plainly in place. Nobody
suspects the order they did things in, so the usual next step is to delete the
column and make it again, which does not help either.

## What the checkpoint asserts

The borrowed date arrives, and it is the date the other table holds.

## What the fixture has to hold

The two rows are connected **before** the borrowing column exists. That order
is the whole case, and a link that never landed would leave the column
correctly empty.

## Why the case waits

Filling a new column in is work that happens after the request answers. A case
that read once would call slow "empty", so it polls until the value arrives or
the attempts run out.
