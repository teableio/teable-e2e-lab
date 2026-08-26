# link/y245-deleting-a-row-clears-links-pointing-at-it

**T5381** — fixed.

## What the user sees

A row is deleted from one table, and a cell in another table still names it.
The name is still shown, filters and counts still include it, and opening it
finds nothing.

The table that was cleaned up looks clean. The damage is on a different table,
usually noticed much later, which is why nobody connects the two.

## Why

Deleting a row clears it out of the cells that point at it, and the clearing
recognised those columns by a piece of their stored shape. Link columns written
by an older version of the product carry that shape differently, so they were
skipped.

## What the checkpoint asserts

The cell that pointed at the deleted row is empty **and** the cell pointing at
a row that was not deleted still holds it. A cleanup that cleared every link
would be worse than one that cleared none.

## What the fixture has to hold

Both cells are read back before the delete, so a cell that was never pointing
at anything cannot be mistaken for a cell that was cleared.

The older stored shape is written with SQL as setup. It is not a state the
product produces now, and nothing in the product distinguishes a column that
carries it — which is exactly why the report reads as "sometimes deletes leave
things behind".
