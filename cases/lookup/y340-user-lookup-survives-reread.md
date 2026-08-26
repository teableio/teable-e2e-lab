# lookup/y340-user-lookup-survives-reread

**T6941 / Y340** — fixed by `927f79fa2` and `147f587d8`.

## What the user sees

A User lookup over a one-to-many link shows its computed person. After the
source user changes and the lookup recomputes, refreshing must not make the
value disappear.

## What the checkpoint asserts

Two independent reads first return the original one-item user array. The
runner then changes the source to a different real collaborator and waits for
recomputation. A further independent read returns the replacement user, and
the public field description still marks the lookup as multi-value.

## What the fixture has to hold

The runner creates and invites a second user, then creates the source row, host
row, one-to-many link, and User lookup entirely through public APIs. Before the
checkpoint it verifies that the host row is linked to exactly one source row.
