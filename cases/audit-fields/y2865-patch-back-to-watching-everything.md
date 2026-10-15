# audit-fields/y2865-patch-back-to-watching-everything

**T7788** — fixed in `614fff9c7`.

## What the user sees

An integration widens a last-modified column back to "everything", is told
it worked, and the column still ignores edits to every other column.

## What the checkpoint asserts

The PATCH answers 2xx from v2, the column stores `trackedFieldIds: []`,
and an edit to a column that was not watched before moves the last-modified
time to the moment of the edit.

## What the fixture has to hold

The column starts narrowed to one column, and the edit is to a different
one, a couple of seconds after the row was created.
