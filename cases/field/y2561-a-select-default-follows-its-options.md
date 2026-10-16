# field/y2561-a-select-default-follows-its-options

**T7820** — fixed in `92594e794`.

## What the user sees

Fixing a typo in a status option makes the column unsaveable with
"defaultValue must match an option name", until someone finds the default and
changes it by hand.

## What the checkpoint asserts

Each edit, sending the choices only, answers 2xx from v2: after the rename
the default is the new name; after deleting that option the default is gone;
after deleting every option the multi-select default named, it has no
default; and a new row is created with both columns empty.

## What the fixture has to hold

The single select defaults to its first option, the multi-select to all
but its last, so the deletes remove exactly what the defaults name.
