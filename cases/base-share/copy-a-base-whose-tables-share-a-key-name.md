# base-share/copy-a-base-whose-tables-share-a-key-name

**T6990** — fixed. On the `same-named-fk-base-duplicate` runner.

## What the user sees

Duplicating a base fails. The browser reports an unhandled rejection naming a
Postgres error — a constraint that "does not exist" — and the base is left
half-made. Pressing duplicate again does the same thing, and there is nothing in
the base a person could change to get past it.

## Why

Postgres constraint names are unique per **table**, not per schema. Two tables
in one base can each own a foreign key called `fk___id`, and old bases do: a
self-referencing key on the row id column, from before the naming changed.

Duplicating a base drops those keys, copies the rows, and puts them back. The
step that listed the keys to drop matched on the name and the schema and not on
the table that owns them, so each table's list came back carrying the other
table's rows. The drop then ran the same statement twice for one table; the
second found nothing and raised 42704, and the duplicate died there.

## What the checkpoint asserts

The duplicate succeeds — a refused request throws inside the checkpoint, which
is the report — **and** the copy holds every table. A duplicate that answered
201 while losing a table would be the same interrupted copy behind a success.

## Why the fixture is written with SQL

Nothing a person can do produces `fk___id` any more. It is what an old base has
been carrying since before the naming convention changed, which is also why
nobody hitting this could get out of it from the interface. `fixture-db` is the
only way to build that state; the observation stays on the public duplicate
endpoint.

The fixture then counts, before the checkpoint, how many tables in the schema
carry the name. With only one there is nothing to collide, and the case would
report on nothing.

## The v1 column

Skipped. The fix is on the v2 duplicate route's own foreign-key introspection;
v1 keeps its legacy helper untouched until it retires, so a v1 answer here is a
different question rather than a comparison.
