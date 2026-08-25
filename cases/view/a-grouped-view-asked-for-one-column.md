# view/a-grouped-view-asked-for-one-column

**T6495** — fixed.

## What the user sees

A grouped table that arrives as a flat list.

A grouped table is mostly its headings: they carry the value each group is for
and how many rows are in it, and on a table of any size they are the only part
a person reads before deciding where to scroll.

Asking for a narrowed set of columns — which is what the grid does when the
rest are scrolled out of sight — dropped them. The rows still arrive. Only the
headings and their counts are gone, so there is no way to tell where one group
ends and the next begins.

Which columns happen to be on screen is not something a person chooses or
notices, so the same table looks grouped or ungrouped depending on where they
had scrolled.

## What the checkpoint asserts

Asked for one column instead of all of them, the view comes back with the same
number of group headings — and with all its rows, so "the rows are missing"
stays a different report.

## What the fixture has to hold

Asked for every column, the view really is grouped and has the headings the
fixture declares. Without that, the checkpoint could not tell a dropped heading
from a table that was never grouped.

Two different statuses at least, so a grouping that collapsed into a single
heading and a correct one stay distinguishable.
