# audit-fields/y2855-a-new-audit-column-watches-everything

**T7786** — fixed in `a08268455`.

## What the user sees

Reading a new last-modified column's settings back, a client cannot tell
"watches every column" from "never configured", and an editor opening it has
no setting to show.

## What the checkpoint asserts

Both a last-modified time and a last-modified-by column, created without
options, read back from the v2 field list with `trackedFieldIds: []`.

## What the fixture has to hold

No rows are needed: the bug is in the stored settings. The watching
behaviour itself was correct and is guarded by the two sibling cases.
