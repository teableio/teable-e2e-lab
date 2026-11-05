# space/a-legacy-data-database-migrates-on-retry

**T8358** — fixed in `3510cb071` (the failure shipped with #4402).

## What the user sees

After an upgrade, every table in a space that keeps its data in its own
database answers 500 and the space's data connection shows an error.

## What the checkpoint asserts

Retrying the space's data-database migration answers 2xx, and the table's
records then read back with 200 and the rows written before.

## What the fixture has to hold

A database created for the run on the same server, bound to a new space as
its own data database (initialized empty), with one table and two rows. The
data database is then put in the state an older deployment left behind
(setup only, with the database): the undo capture trigger bound to the
shared function in the public schema, the migration that inspects that
function marked as not yet applied, and the main database's record of the
connection's schema version cleared so the retry migrates for real instead of
skipping a connection that already looks current.
