# selection/paste-lands-on-the-row-you-see

**T5087** — fixed.

## What the user sees

A view sorted by status or by owner, where most rows share the same value, with
a couple of rows dragged to the top by hand. That is an ordinary personal view.

Sorting throws the drag away: the view comes back in creation order and every
row someone pulled to the top is back where it started.

Downstream of that, pasting into a row puts the value on a different row. The row that was selected
is untouched. Nothing about it looks like an error — a value appears in the
column, just not where it was put — so the wrong row is found later, by someone
who has no reason to connect it to a paste.

The same applies to clearing and to deleting a range: everything addressed by
position.

## Why

A sort only decides the order of rows whose values differ. Rows that tie keep
the order the view already had, which is what dragging a row changes. The grid
resolved those ties by the view's row order and the operation resolved them a
different way, so the two disagreed about which row is second.

## What the checkpoint asserts

Two things, in order.

First: after sorting by a column every row shares, the view still shows the
rows in the order they were dragged into. That is where the two builds differ —
before the fix a sorted view answers in creation order, throwing away the drag.

Then: pasting into the second row on screen changes the record the view showed
at that position, identified by name rather than by position. The whole failure
is that position and record can disagree, so an assertion by position could not
see it. Exactly one row may change.

## What the fixture has to hold

Four rows, all sharing the sorted value, with the last dragged to the top. If
nothing were dragged, both ways of resolving the tie would agree and the case
would prove nothing.

The drag is verified **before** the sort is applied, not after: what the sorted
view answers is the thing under test, and checking it as a fixture condition
reported the bug as a broken fixture instead (run 32688452945).
