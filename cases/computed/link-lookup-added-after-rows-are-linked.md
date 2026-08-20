# computed/link-lookup-added-after-rows-are-linked

**T6770** — fixed. One of three cases on the `computed-backfill-recast` runner;
see the group note in
[number-column-converted-to-formula-lookup.md](number-column-converted-to-formula-lookup.md).

## The bug

Add a lookup of a link field to a table whose rows are **already linked**, and
the new column stayed empty on exactly the rows that had something to show.

Adding it seeds it with one backfill over the existing rows. An earlier repair
had taught that backfill to recast its assignments to the physical column type
— but only the non-json ones. A single-value lookup-of-link still assigned a
text-typed alias into a jsonb column, so the schema operation went dead.

## Why the ordering is the shape

Rows linked first, lookup added second. That order is the entire reproduction:
a lookup added to an empty table and linked afterwards fills in row by row
through a different path and never runs the seeding backfill at all.

The runner checks the ordering rather than assuming it — before adding the
lookup it reads the host's link cell and refuses to continue unless the rows
really are linked. A case that seeded over nothing would report green without
having exercised anything.

## The graph

Three tables, and the relationships are not interchangeable:

- **related** — one row, holding the title the assertion looks for.
- **foreign** — one row, joined to related by a **manyMany** link. Its link
  field is the one being looked up, and manyMany is what makes that field's
  value a collection.
- **host** — one row, joined to foreign by a **oneOne** link. Single-valued on
  the host side is what produced the text-typed alias; the fix's own
  reproduction is this pair of relationships and this case keeps them.

## What the checkpoint asserts

The lookup is created, and within the settle budget the host's new cell holds
the related row's title.

The budget is the assertion — the backfill runs inside a `table.update` schema
operation, so a failure is never raised to the caller. The operation retries
until it is dead and the column stays empty.
