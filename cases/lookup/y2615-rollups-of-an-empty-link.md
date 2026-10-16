# lookup/y2615-rollups-of-an-empty-link

**T7821** — fixed in `b6f2d8ef7`.

## What the user sees

A product with no reviews averages zero stars and drags every ranking
down; an exclusive-or with nothing to compare reads a real "no". Removing a
row's last link leaves those answers in place.

## What the checkpoint asserts

On a row that was never linked and on a row whose links were removed, the
average and the exclusive-or are empty and the sum is 0. The sum is the
control: 0 is right for a sum of nothing.

## What the fixture has to hold

Two items with one flag set, linked first so the row reads a real average
(15) and a true exclusive-or before the links are removed.
