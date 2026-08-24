# audit-fields/y182-last-modified-by-resolves-name

**Bug:** T6641 — the record card's `Editor` field showed a raw user id
(`usreOCcpI0QR2B2XLLr`) instead of the editor's name.

## What broke

v2's record-read hydration enriches public user cells — turning a stored user
reference into `{ id, title, email }` so the grid and the record card have a
name to show. `lastModifiedBy` was deliberately excluded from that pass.

For most rows that goes unnoticed, because a modified row gets a full snapshot
written into the cell and the snapshot already carries a title. The gap only
shows on cells that have no snapshot of their own:

- a **legacy** cell holding nothing but the bare user id, and
- a cell that is **NULL**, whose editor is recoverable only from the system
  audit column beside it.

For both, the read fell back to using the id as the display title. What the
user saw in the `Editor` field was an internal identifier.

`CreatedBy` was never excluded, and resolves the name for exactly those same
stored shapes — which is what makes this one field's hydration gap rather than
a limit on what the read path can know.

## Reproduction

1. Create a table with a text field, a `CreatedBy` field and a
   `LastModifiedBy` field, and two rows.
2. Write the two historical shapes into the `LastModifiedBy` column — a bare
   id (`to_jsonb('usr…'::text)`) on one row, `NULL` on the other. SQL, see
   below.
3. `GET /table/{tableId}/record`.

Before the fix, both `LastModifiedBy` cells come back with the raw id as their
title. After it, both carry the editor's name.

## What the checkpoint asserts

For both rows: the `LastModifiedBy` cell identifies the editor **and** its
title is the editor's name rather than their id.

Plus the control — the `CreatedBy` cell on the same row must also resolve. If
that fails, the read path cannot resolve names at all under this fixture and
the case is asking the wrong question; it should be read as a broken case, not
as this bug.

The runner refuses to run if the seed user's name happens to equal their id,
because the bug and the fix would then look identical.

## Why the data looks like this

Two rows, one per storage shape, because they fail through different paths: one
has a value that is the wrong shape, the other has no value at all and depends
on the audit column. A case with only the first would leave the more common
production shape — the NULL cell — untested.

The shapes are written with SQL because they are history. Today a modified row
gets a full snapshot, so neither is reachable through the API; what this
rebuilds is what survives in tables that predate that. The observation is the
ordinary record read, which is exactly where the user met it.
