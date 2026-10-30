# table/y3418-a-duplicated-table-keeps-its-row-order

**T8110** — fixed in `37035f224`.

## What the user sees

Someone duplicates a table (with records) from the sidebar after moving rows
around in its grid; instead of a copy they get an error, or a copy whose rows
are in a different order.

## What the checkpoint asserts

Duplicating the table through the base-node route with `includeRecords`
succeeds, and the duplicate's grid lists the rows exactly in the source view's
order (Row A, Row C, Row B).

## What the fixture has to hold

Two tables created for the run in the seed base and dropped afterwards: a
foreign table, and a source table with a many-one link to it. The source gets
Row A and Row B, then Row C inserted before Row B in its grid view, and the
source view is read back to confirm that order before the duplicate.
