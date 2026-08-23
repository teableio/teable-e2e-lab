# computed/oversized-cell-does-not-stall-its-neighbours

**T6728** — fixed.

## What the user sees

A table where one row holds an unusually long piece of text. A formula over
that column computes fine for every ordinary row until that one row is there;
then none of them fill in. The write answered 200, no error appeared anywhere
in the product, and the cells simply stayed empty.

## Why

A computed cell has a ceiling — 262144 bytes by default. Crossing it is a real
constraint and the row that crosses it genuinely cannot be stored. What was
wrong is what happened to the rows that did not cross it: the computed task
that produced the batch failed as a unit and dead-lettered as a data-safety
failure, which the admin console will not replay, so every other row in the
same pass lost its value too.

One row that is too big is a data problem the owner can fix. One row that is
too big silently stopping the rest of the table is not.

## How the case is built

One long row and four ordinary ones, then the formula is added — creating it
after the rows exist means the first pass is a backfill over all of them, which
is where a single failing cell takes the batch with it.

The assertion is the ordinary rows, and it is a wait rather than a check: the
pipeline is asynchronous and reports nothing to the caller, so a value that
never arrives is the failure. Too short a timeout and a slow-but-working
pipeline reads as the bug; the budget here is 90 seconds against a backfill
that normally settles in seconds.

Every number in the fixture is checked against the product's own limits before
anything is built: the computed result has to cross the ceiling, the source
cell has to stay under the ordinary cell ceiling (or the write is refused and
the formula never runs at all), and the ordinary rows have to compute to
something well inside it. The long cell is also read back at full length before
the formula exists — a source value quietly truncated on write would compute to
something legal, and the case would be green on both sides of the fix while
appearing to test the overflow.

## What it does not say

What the oversized row itself ends up showing is recorded in the artifact and
deliberately not asserted. Whether that cell is reverted, blanked, or marked
with a field error is a product decision this case has no opinion about; it is
about the rows that were never the problem.

The other halves of the same change — overflowing select options, and
createMany truncating to remaining capacity — are not covered here.
