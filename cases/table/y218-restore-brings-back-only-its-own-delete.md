# table/y218-restore-brings-back-only-its-own-delete

**T6227** — fixed.

## What the user sees

A table is restored from the trash and comes back with a column that was
removed months ago — holding whatever was in it at the time. On a table that
has been tidied more than once, restoring it undoes the tidying as well.

## Why

Deleting a table marks its fields and views deleted alongside it. The restore
therefore looked for the things marked deleted and put them back — all of them,
without distinguishing the ones the table's own delete had marked from the ones
that were already marked before it.

## How the case is built

A table with a column that is deleted and then **backdated** by a day with SQL,
before the table is trashed.

The backdating is the fixture. Deleting the column a moment before trashing the
table leaves the two indistinguishable by time, which is the one thing the
restore has to tell apart — and a case that cannot tell them apart either would
pass on a build that restores everything. The runner refuses a backdate of less
than an hour.

The column is confirmed gone before the table is trashed, so "it came back"
cannot describe a column that never left.

## What the checkpoint asserts

Both directions. The ordinary column is back — a restore that returned an empty
table would otherwise satisfy the interesting half — and the retired column is
not.

## Limits

Fields only. The change covers views deleted before the table as well, and
nothing here exercises that.
