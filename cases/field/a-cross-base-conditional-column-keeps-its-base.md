# field/a-cross-base-conditional-column-keeps-its-base

**T7064** — fixed. On the `cross-base-conditional-base-id` runner.

## What the user sees

A conditional lookup or conditional total is pointed at a table in a **different
base**. It works: the values arrive and stay correct. Reopen the column's
settings and the foreign table is drawn as a table the person has no permission
to see.

Nothing is actually inaccessible. But the column can no longer be changed from
that screen, and a save made from it writes the settings back with the base
already missing.

## Why

The column stores three things: which table, which column, and — when the table
is not in this base — which base. The third was dropped crossing the mapping
boundary between the two record engines. What was read back named a table with
no base to resolve it in, and "cannot resolve" renders as "no permission".

## What the checkpoint asserts

The field list — which is what the settings screen loads — still carries the
foreign base id, on both the conditional lookup (`lookupOptions.baseId`) and the
conditional total (`options.baseId`). Both, because the fix threaded the id
through two column types and one of them could regress alone.

Outside the checkpoint, the columns are read once and must hold the values from
the other base. A column that never computed would have nothing meaningful to
say about its source either, and this case is about a column that works and
still cannot describe itself.

The second base is created in the same space as the host's. Across spaces the
product refuses the link outright — "cross-space link is no longer supported" —
so the state this case is about only exists between two bases of one space.

The engine is asserted on the create response of the cross-base column itself —
the request that puts the state under test in place.
