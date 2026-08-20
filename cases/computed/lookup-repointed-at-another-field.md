# computed/lookup-repointed-at-another-field

**T6765** — fixed.

## The bug

A lookup's stored `db_field_type` is a declaration about a column that already
exists. Rebuilding a lookup copied that declaration forward — unconditionally,
without asking whether the shape underneath it had changed.

Repointing a lookup from a date field to a text one changes the shape. The
column becomes text; the declaration went on saying `DATETIME`. The backfill
then generated its assignment from the declaration and Postgres refused it, so
the `table.update` schema operation retried until it was dead and the column
stopped filling in. Nothing was raised to the caller.

The commit names three more copies of the same mistake — `TEXT` kept across
text-to-link, jsonb kept across one-many-to-many-one, `TEXT` kept on a formula
rebuilt after its source became a number. They are one bug: a copy that should
have been conditional on the shape staying the same.

## Why the rebuild is the whole shape

The drift is **created by the rebuild**, not by the creation. A lookup made once
derives its types fresh and they agree.

That is not a guess. Three earlier cases on this runner each converted a field
once, and all three were green on every column of two matrix runs. A probe run
then read the declaration and the physical column together on the fix's parent
and found them in agreement in all three — `REAL`/`double precision`,
`JSON`/`jsonb`, `TEXT`/`text`. The bug was not invisible to those cases; the
state it needs was never built.

So this case builds it: a lookup that has **already computed** in its first
shape, and is then repointed. The runner refuses to continue unless the date
lookup really filled in first — a lookup that never computed has nothing to
rebuild, and the case would be watching a rebuild that never happened.

## What the checkpoint asserts

The lookup is repointed at the foreign text field, and within the settle budget
every host cell holds that field's value.

Forty rows, and every one of them is read. A backfill that lands on some rows
and not others is exactly what a schema operation dying partway leaves behind,
and reading a single row would call that a pass.

The budget is the assertion. The backfill runs inside a `table.update` schema
operation, so there is no error to catch and nothing in the response to read —
only a column that never fills in.

## Relation to the other cases here

`lookup/stale-text-metadata-recasts-on-rebuild` and its sibling reach the same
mismatch from the other end: they write the drifted declaration with SQL,
because on those the drift is the residue of old migrations, and they assert
that a rebuild recasts it. This case asserts that a rebuild does not _create_
one. The pair is worth having — one guards the repair, the other the cause.
