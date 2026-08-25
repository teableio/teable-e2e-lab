# selection/paste-what-a-row-already-holds

**T3275** — fixed.

## What the user sees

Every row marked as changed today, by a paste that changed nothing.

Pasting over a selection is not always an edit. People re-paste the same export
to be sure it went in, paste a column back over itself after sorting, or paste
a block that overlaps rows they had already filled in. The rows that end up
holding what they already held were not changed by that.

They were stamped anyway. "Last changed" is what a team uses to see what moved
since yesterday; a paste that rewrites the stamp on rows it did not touch
erases exactly that, and there is no way to get the old stamps back.

## What the checkpoint asserts

The row's last-changed stamp is unchanged after its own value is pasted back
over it — and the row still holds that value, so "the paste wrote nothing at
all" stays a different report.

## What the fixture has to hold

A control first, outside the checkpoint: a paste that really changes a cell,
made the same way, moves the stamp. Without it, a stamp that stayed put
afterwards could just as well be a column that never updates.

The steps are spaced out, so a stamp that moved differs from one that did not
at the second the column is formatted to.
