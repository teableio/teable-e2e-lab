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

A source table and a host table. Each host row links to one source row, looks
up its text, and computes a formula over that lookup. Everything computes
normally on the seed values first — if the chain did not work, "the ordinary
rows lost their values" would be describing a formula that never produced any.

Then one write changes every source row at once: the ordinary ones to a new
small value, one to a value whose host-side result crosses the ceiling. The
host rows recompute as a single task, which is where a rejected cell takes the
rest with it.

## Why it is shaped like that

Two earlier shapes measured the constraints, and both are worth keeping
because each looks like a simpler way to write this case:

1. **Creating the formula field last** and letting the creation backfill
   compute was green on both columns: it stored a 300000-byte computed cell on
   `d28589d10` as well as on `develop`. The ceiling is enforced in the
   pipeline's record-change path, and the backfill never consults it. Run 32649775516.
2. **Writing to the same table the formula lives on** was red on both columns,
   with the write itself refused. That compute runs synchronously, and
   synchronous compute fails closed by design — the change says so. Run 32650260500.

The isolation the fix adds belongs to the async worker, and work reaches the
worker when it is past the first dependency level (same-table recomputes stay
inline below 2000 dirty rows). So the formula has to sit in a second table
reading the first through a link. That is also the ordinary production shape:
a rollup or lookup over another table is where a cell grows without anyone
deciding to make it big.

Every number in the fixture is checked against the product's own limits before
anything is built: the host result has to cross the ceiling, the source cell
has to stay under the ordinary cell ceiling (or the write is refused and the
formula never runs), the ordinary rows have to compute well inside it, and the
seed value has to differ from what the ordinary rows are changed to — a write
that stores the same value queues no recompute at all.

## What it does not say

What the oversized row itself ends up showing is recorded in the artifact and
deliberately not asserted. Whether that cell is reverted, blanked, or marked
with a field error is a product decision this case has no opinion about; it is
about the rows that were never the problem.

The other halves of the same change — overflowing select options, and
createMany truncating to remaining capacity — are not covered here.
