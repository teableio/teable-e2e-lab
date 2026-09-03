# lookup/y575-repoint-a-borrowed-choice-column

**T6208** — fixed.

## What the user sees

A choice column with no choices left in it.

A choice column _is_ its choices: they are what the cell draws, what a filter
lists, and what a person picks from. Repointing which link a borrowed choice
column travels along is an ordinary edit — the same information reached a
different way, after the tables were rearranged.

It wiped them. The column keeps its name and its place, the cells keep their
text, and everything built on the choices stops working: the filter has nothing
to offer and the grid has nothing to draw them with.

## What the checkpoint asserts

After the column is pointed through the other link, it still offers the same
choices — and it really did move, so "the edit did not take" stays a different
report.

## What the fixture has to hold

The borrowed column offers the choices before it is repointed. Without that, a
column that never had them would fail the checkpoint for the wrong reason.

Two choices at least, so a column that lost them and one that kept a single
choice stay easy to tell apart.
