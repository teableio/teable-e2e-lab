# table/y884-a-table-being-changed-is-still-there

**T6660** — fixed.

## What the user sees

Somebody is adding columns to a table. Everybody else with it open starts
getting errors — and what the errors say is that the table does not exist,
which is what a deleted table says. The table is plainly there, and a moment
later it reads fine again.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why a burst rather than one column

Adding a column that needs the stored table rebuilt marks the table as being
worked on and marks it ready again when the rebuild lands. Reads resolve tables
by "ready", so only a read landing inside that window failed. One column opens
the window once, which is a coin flip; the reported shape is a person — or an
assistant — adding several in a row, which keeps it almost continuously open.

The runner refuses a configuration with fewer than two columns for that reason.

## How the case is built

A table with rows, then six columns added one after another. Each column is
started without waiting for it, and ordinary reads — the rows of the table, the
request a page makes — are fired in batches of eight for as long as that column
is in flight.

The columns are added through the public API rather than the marker being
written directly. The window is the product's own: a build that opens it for
longer or shorter is measured as it is, and a build that never opens it makes
this case green rather than making it lie.

## What the checkpoint asserts

That none of those reads failed, and the error names how many of the failures
said the table does not exist — that wording is the whole complaint, because it
sends people looking for who deleted their table.

## Limits

A race, so this case can only be as reliable as the window is wide. If it ever
goes quiet on a commit where the fix is absent, the answer is more columns
rather than more reads: the window is opened by the column, not by the reading.
