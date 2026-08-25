# link/the-picker-behind-a-borrowed-link

**T6942** — fixed.

## What the user sees

A row picker that will not open, on one column, with nothing to distinguish
that column from the ones that work.

Clicking a link cell opens a list of rows to choose from. That list has to come
from somewhere, and for a column that borrows a link from another table the
answer is written one level deeper than for an ordinary link: the borrowed
column keeps the name of the column it borrows, and only that column knows
which table it reaches.

The picker looked in the shallower place, found nothing, and went on to ask the
database for a table with no id.

## What the checkpoint asserts

The picker opens, on the table the borrowed link actually reaches, and it comes
back with a name column to show.

The request is sent with the status left open on purpose: a picker that refuses
and a picker that opens on the wrong table are different reports, and the
status is what tells them apart.

## What the fixture has to hold

The borrowed column really borrows the middle table's link. If it borrowed
something else, the picker would be right to look elsewhere.

The stored shape is finished with SQL: a column made through the interface
today carries a copy of settings that the same column, made months ago, does
not, and the older shape is the one the bug needs.
