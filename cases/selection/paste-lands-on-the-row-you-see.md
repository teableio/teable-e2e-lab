# selection/paste-lands-on-the-row-you-see

**T5087** — fixed.

## What the user sees

A view sorted by status or by owner, where most rows share the same value, with
a couple of rows dragged to the top by hand. That is an ordinary personal view.

Pasting into a row puts the value on a different row. The row that was selected
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

Which **record** changed, by name — not which position. The whole failure is
that position and record disagree, so an assertion by position could not see
it. Exactly one row must change, and it must be the one the view showed at that
position.

## What the fixture has to hold

Four rows, all sharing the sorted value, with the last dragged to the top. If
nothing were dragged, both ways of resolving the tie would agree and the case
would prove nothing; the runner checks the dragged row really is first before
pasting.
