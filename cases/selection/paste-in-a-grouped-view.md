# selection/paste-in-a-grouped-view

**T4853** — fixed.

## What the user sees

A grouped view — the same rows, arranged by store, by owner, by status. That is
how most people look at a table of any size.

Pasting into a row puts the value on a different row. The row that was selected
is untouched, and nothing reports an error. The same goes for clearing and for
deleting a range: everything addressed by position.

## Why

Grouping rearranges the rows completely. Operations addressed by position
worked out which rows they meant without applying the grouping, so they counted
from an order the screen never showed.

## What the checkpoint asserts

First that the grouping is applied to what the page is shown at all: on the
fix's parent the view answers in the order the rows were created (run
32691586917). Checking that before the checkpoint reported the bug as a broken
fixture instead.

Then which **record** changed, by name. Asserting by position could not see this at
all — position is exactly what the two sides disagree about. Exactly one row
may change, and it has to be the one the grouped view showed at that position.

## What the fixture has to hold

Rows created in an order that interleaves the groups, so grouping genuinely
moves them. If the grouped order matched the creation order, both ways of
counting would agree and the case would prove nothing — which is why that
comparison is an assertion rather than a precondition.

## Its neighbour

`selection/paste-lands-on-the-row-you-see` is the same failure reached through
sorting rather than grouping: rows that tie on the sorted column keep the order
they were dragged into, and the operation resolved that tie its own way.
