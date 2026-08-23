# import/import-writes-no-record-history

**T6524** — fixed.

## What the user sees

Two things, both downstream of the same write. A large import is slower than it
should be, and the record history afterwards is full of entries for rows that
were never edited — one per cell, every one of them "empty → value".

Creating a row through the product writes no history at all, because a new row
has no previous value to record. An import is creating rows.

## The size of it

One entry per non-empty cell means rows times columns. A 10000-row sheet with
20 columns is 200000 history entries, written during the import that produces
them.

## How the case is built

A table, one row created through the API — the control — then a three-row
two-column sheet imported.

Which import matters. The first shape of this case added the sheet's rows to
the table that already existed, and was green on both columns (run
32656953918): that handler does not write the history entries. The case now
takes the other entry point, where the import creates the table as it goes,
which is the handler the fix names.

The row created through the API is the control, and it is checked before the
import: history has to be empty after it. Without that, "the import wrote
nothing" could just as well mean history is switched off in this environment
entirely, and the case would pass everywhere.

Every cell in the sheet is filled. Empty cells were never the problem — the
amplification is per non-empty cell — so a sparse sheet would understate it.

## What the checkpoint asserts

That the history stays empty for a watched period rather than at one instant.
The import answers before its rows are all in and history is written by a
projection behind it, so a single read taken too early would pass on a commit
that writes plenty.

## Limits

Three rows. The case proves the entries are not written at all, not that the
count scales — which is the same thing here, since the claim is zero.

The fix also stops history for table duplication, and leaves it on for
import-triggered updates to existing rows through link symmetric fields.
Neither is covered here.
