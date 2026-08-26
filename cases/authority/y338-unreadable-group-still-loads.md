# Y338: Restricted grouped grids load and keep their permitted behavior

**T6944 / Y338** — fixed by `04af0858e`.

## What the user sees

A member opens a grid whose persisted group points at a field they cannot read.
The page must load the permitted records, omit that field, and keep its record
subscription healthy instead of surfacing a validation or socket error.

The same degradation applies when the grouping field is conditionally masked.
Existing permissive behavior for a view filter and sort on an unreadable field
must also stay intact.

## What the checkpoint asserts

The browser opens the actual restricted grid. The navigation succeeds, the
grid renders, and the browser's live record subscription omits the unreadable
persisted group, receives every permitted row, and raises no page or socket
error. A separate public v2 request echoes the persisted group and verifies
the same complete, field-filtered record set.

Two API checkpoints then assert that:

1. A persisted group on a conditionally masked field returns only permitted
   records instead of rejecting the request.
2. A persisted filter and sort on a statically unreadable field are ignored,
   preserving the complete readable record set.

## What the fixture has to hold

The runner creates three deterministic records with title, category, and
status fields; three purpose-built grid views; a real second member; and one
permission role. Owner reads prove all views and rows exist before permissions
are applied. Permission changes between checkpoints happen outside each
checkpoint so a broken fixture cannot be mistaken for T6944.

Extra client-supplied group keys remain strict by design. This case sends only
the persisted group echoed by the grid, which is the input T6944 changed.
