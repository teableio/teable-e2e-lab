# selection/y200-paste-by-id-across-pending-field

**T6759** — fixed. The lead case of two on the `paste-over-pending-field`
runner; the sibling is `selection/y199-paste-across-pending-field`, and the shared
design is described here.

## What the user saw

One person in a base could not paste. Everyone else in the same base could.
Nothing about the selection, the columns, or their permissions explained it.

## Why

The base carried a computed field marked pending whose physical column had
never been provisioned. Pending is meant to be a passing state while a field is
being built; a schema operation that dies partway leaves the field row marked
pending forever, with no column behind it. The grid draws that column like any
other, so from inside the product there is nothing to see.

v2 asked the record read and write for every field in the selection, that one
included, and generated SQL against a column that does not exist — HTTP 500,
Postgres `42703`. The ordinary columns in the same selection went down with it,
so one leftover field made a region of the table unwritable.

The fix keeps the pending field in the positional clipboard mapping — dropping
it outright would shift every column pasted after it one place left — while
excluding its id from the reads, the writes, and the computed dependency graph.

## How the case is built

Two ordinary text columns and a formula between them in the selection. The
formula is created normally, then the fixture marks its row pending and drops
its physical column: that pair is exactly what the failed schema operation
leaves behind, and there is no way to ask the product for it. Before the
checkpoint the case confirms the column is really gone — if it were still
there, the paste would succeed on both sides of the fix and the case would be
reporting on nothing.

The assertion is not just that the paste answers 2xx. The row is read back,
because a 2xx that wrote nothing is the same loss with a friendlier status. The
two pasted values differ from each other on purpose, so a paste that landed on
one column and not the other cannot pass.

## Limits

The case proves the two ordinary columns are written. It says nothing about
what the pending column itself should show, or about repairing it — a field
stuck in this state is still broken after the paste succeeds, and nothing here
asks the product to notice that.
