# audit-fields/y2857-deleting-the-watched-column

**T7787** — fixed in `a08268455`.

## What the user sees

After a column is deleted, "last modified" and "last modified by" never
change again, whatever is edited.

## What the checkpoint asserts

After the watched column is deleted, both columns store `trackedFieldIds:
[]`, and an edit to a column that was never watched moves the last-modified
time to the moment of the edit and fills in who made it.

## What the fixture has to hold

A primary column of its own, because the watched column has to be
deletable. The edit comes a couple of seconds after the row was created, so a
frozen value and an updated one are different instants.
