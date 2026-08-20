# computed/formula-over-text-stored-link-lookup

**T6767** — fixed. One of three cases on the `computed-backfill-recast` runner;
see the group note in
[number-column-converted-to-formula-lookup.md](number-column-converted-to-formula-lookup.md).

## The bug

A lookup of a **link** field normally lives in a jsonb column. When it does not
— when the column it was converted out of was a text one, and stayed text — the
titles are stored as text.

A formula written over such a lookup backfilled by hard-casting that column
with `::jsonb`, and Postgres refused it:

```
invalid input syntax for type json
```

The formula column stayed empty while the lookup sitting right next to it read
perfectly well, which is the part that makes this hard to report: the data is
visibly there, one column over.

## The shape, and what is fixture in it

Three tables. A peer row, a foreign row linking to it, and a host row linking
to the foreign one. The host also carries an ordinary **text** field, which is
then converted into a lookup of the foreign table's link field.

That conversion is fixture, not observation — it succeeds on both sides of the
fix, and it is what leaves the titles in a text column. The runner waits for
that lookup to actually fill in before going any further: if it has not, the
formula would have nothing to read and this case would go red for the
conversion rather than for the formula backfill it is about.

## What the checkpoint asserts

A formula `{lookup}` is created over that column, and within the settle budget
the formula cell holds the peer's title.

The budget is the assertion, for the same reason as in every case on this
runner: the backfill runs inside a `table.update` schema operation, so nothing
is raised to the caller. The operation retries until it is dead and the column
stays empty.

## Why the assertion is loose about the container

It looks for the title anywhere in the serialized cell rather than pinning an
exact shape. A lookup through a `manyOne` link may come back as the value or as
a single-element array, and none of these bugs is about which — the question is
whether the value arrived at all. Pinning the container would make the case red
for changes it is not watching.
