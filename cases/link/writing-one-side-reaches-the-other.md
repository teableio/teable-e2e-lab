# link/writing-one-side-reaches-the-other

**T3531** — fixed.

## What the user sees

A two-way link is one relationship shown twice: "this order contains these
items" on one table, "this item belongs to these orders" on the other. Which
side gets filled in is a matter of where the person happens to be working.

Filling it in from the item's side leaves the order's side empty. Neither side
is marked as wrong, so which one is believed depends on which table the reader
opened — and any count of items per order is short by exactly the ones entered
from the item's side.

## What the checkpoint asserts

Both directions of the same edit. Linking from the far side has to show up on
the near side, **and** clearing from the far side has to clear the near side. A
fix that only carried additions across would leave links nobody can remove.

## The relationship has to be one-many

Many-to-many is green on both columns (run 32697213211) - writing that shape
from the far side already reaches the near side. The case uses one-many, where
the column the product makes on the other table holds a single value rather
than a list.

## What the fixture has to hold

The other side of the link is the column the product creates by itself when the
link is made two-way. The runner reads its id off the link's own settings and
checks it really is a column on the other table before writing through it — an
id that pointed nowhere would fail the write rather than the assertion.

Nothing is linked before the checkpoint, so "the order lists the item" cannot
be true in advance.
