# lookup/dangling-source-does-not-stall-the-table

**T6614** — fixed.

## What the user sees

A table stops keeping up. Edits are accepted and then do not settle; computed
columns that have nothing wrong with them stop updating. The cause is a column
somewhere on that table that reads a field which no longer exists — deleted
long ago, by someone who may not still be around.

## Why

When a field that other fields read is deleted, the dependents are supposed to
be marked broken so the engine knows to leave them alone. Older delete paths
did not always do that, and conditional field types were missed. What is left
is a lookup or rollup aimed at a field nobody can find, carrying no mark —
because the marking is precisely what did not happen.

Generating SQL for one of those answered "Field not found" and killed the whole
computed task it belonged to, classified as an obsolete plan and not retried.
The task is per table, so one broken column stopped every other computed column
on that table.

## How the case is built

A source table with a value, a host table linking to it and looking that value
up. The lookup is checked working first — a lookup that never resolved would
make "the table stopped keeping up" describe something that was never up.

Then the source field is deleted with SQL, directly, leaving the lookup
pointing at it. That is what the state is: the residue of a delete path that no
longer runs. Asking the product to delete the field today marks the dependents
correctly and produces a different, working state, so there is no way to build
this through the API. The case also checks the lookup was _not_ marked broken
by the fixture itself — the state under test is the one where nothing marked
it.

## What the checkpoint asserts

An ordinary edit to an ordinary text column on the host table, which has
nothing to do with the lookup. That is the point: a broken column should not be
able to stop it. The assertion waits for the edit to read back, because the
failure is asynchronous — the write is accepted and then nothing happens.

What the dangling lookup itself shows afterwards is recorded and not asserted.
Whether it reads empty, or is marked, or disappears, is a separate question
from whether the table still works.
