# lookup/conditional-lookup-survives-restore

**T6580** — fixed.

## What the user sees

A column that had been pulling values from another table is deleted by
mistake, restored from the trash, and comes back empty — or does not come back
as the same field at all. Rebuilding it means remembering what its condition
was.

## Why

A conditional lookup joins two tables that have no link between them: it
matches on a value they share — an external post id, an order number — and
pulls a column across. The condition is not a setting on the field, it is the
field: without it nothing says which row to read.

Restoring from the trash did not carry it. The field came back as something
else, and the column stayed blank.

## How the case is built

Two tables with no link anywhere: a source keyed by a reference, and a host
whose own column holds the same references. The lookup matches one against the
other. Two rows with distinct references, because one row cannot show that the
condition matched the right one, and duplicates would pass even if it matched
the wrong one.

Before the delete the case reads the column and requires each host row to show
the value belonging to its own reference. Without that, "the values did not
come back" would be describing a field that never showed any.

The trash entry is written asynchronously, so the case waits for it outside the
checkpoint — restoring nothing would fail for reasons that have nothing to do
with conditional lookups.

## What the checkpoint asserts

Three things, in order: the field is back under its own name; it is still a
conditional lookup and still carries a condition; and the column reads its
values again. The third is separate on purpose — a restore that kept the
metadata and lost the values leaves the user looking at an empty column, which
is the same outcome by a different route.
