# link/y186-cross-base-link-clears-on-delete

**Bug:** T6863 — a link reaching from one base into another was not cleared
when the row it pointed at was deleted.

## What broke

Deleting a record makes the engine look up every link field pointing **at**
that record, so it can clear those cells before the row goes. That lookup was
scoped to the record's own base.

A link field living in a second base was therefore invisible to it. The cleanup
never ran, and the delete went through anyway — leaving a cell in the other
base that still names a row which no longer exists. On the matrix, that is what
the pre-fix column prints:

```
the delete answered 200 but the link in the other base still reads
{"id":"rec4HZy1wPnhJ80ZBix","title":"Owner reached from another base"}
```

The same blind spot has a louder shape too. When the physical foreign key
refuses the delete instead of letting it through, the caller gets a refusal
that blames "a required link" — even for an optional one — and names no table,
so the field holding the row hostage sits in a base the user may not have open.
Whichever way it lands, nothing points at the other base.

## Reproduction

1. One space, two bases.
2. In the first base, an owner table with two rows.
3. In that same base, a host table with an **optional one-way** manyOne link to
   the owner table, pointing at row one.
4. In the second base, a host table with the same kind of link — plus
   `options.baseId`, which is what makes it reach across — pointing at row two.
5. Delete row one. Then delete row two.

Before the fix, deleting row two answers 200 and the second base's cell still
reads row two. After it, the cell is empty.

## The control is the point

Row one is deleted **outside the checkpoint**, and its cell is checked there
too. That delete crosses no base boundary and has always worked.

Without it, a red column says "deleting a row behind an optional link is
broken", which is a much larger claim than the truth and sends whoever reads it
into the wrong code. With it, the two rows differ in exactly one thing — which
base points at them — and the column says so. If the control ever fails, the
runner raises 💥 rather than ❌: optional links being broken in general is a
different fault, and this case should not claim it.

Both links are one-way for the same reason. A two-way link would also put a
symmetric field on the owner table, and clearing that is a different path.

## What the checkpoint asserts

Three things, because the failure has two shapes and only the third one catches
the quiet shape:

1. The delete answered 2xx — a refusal is the loud shape.
2. The row is actually gone, not merely reported gone.
3. The cross-base cell is empty.

Reading the cell back is the whole case. A case that stopped at "the delete
succeeded" would have been green on both sides of the fix.

## Why the data looks like this

Owner rows are titled by how they are reached — "Owner reached from its own
base", "Owner reached from another base" — so the failure message names the
distinction the case is about instead of a record id the reader has to trace.

Both owner rows live in one table. The control and the row under test then
differ in exactly one property, and no difference in table configuration can
creep in between them.

The case owns its space: it needs a second base, and cross-base links only mean
anything between bases one user can see. The space is trashed and then
permanently deleted in a `finally` — permanent deletion is a no-op on a space
that was never trashed, which would leave both bases behind.
