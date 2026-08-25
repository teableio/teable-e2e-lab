# undo/undo-a-column-delete-brings-its-promise-back

**T1111** — fixed.

## What the user sees

Nothing. That is the problem.

"No duplicates" is not so much a property of a column as a promise about the
table: order numbers are unique, this invoice was not entered twice. Deleting
the column by mistake and pressing undo is the most ordinary thing that can
happen to it, and undo is the product saying nothing happened.

The column came back without its promise. From then on the table quietly
accepts the second copy of a row it used to refuse. The column is there, in its
place, with its values; its settings are the only place the difference lives.

## What the checkpoint asserts

After the undo the column is back **and** a second row holding the same value
is still refused.

The case tries the thing the promise is about rather than reading the setting.
A setting that reads as on while duplicates go in would be a worse green than a
red.

## What the fixture has to hold

The promise holds before anything is deleted — a second row with the same value
is refused. A column that never refused duplicates would make the checkpoint
unfalsifiable.

The delete and the undo carry the same window id, because that is what the undo
stack is keyed by, and it is unique per run so the case cannot pick up an entry
it did not create.
