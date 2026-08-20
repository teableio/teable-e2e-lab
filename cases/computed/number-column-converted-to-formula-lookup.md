# computed/number-column-converted-to-formula-lookup

**T6765** — fixed. One of three cases on the `computed-backfill-recast` runner;
see the group note at the bottom.

## The bug

Convert a number column into a lookup of a foreign formula, and the column
stopped filling in.

A field's stored `db_field_type` is metadata about a column that already
exists. Rebuilding a lookup copied that metadata forward unconditionally — and
a conversion is exactly the moment the physical shape changes underneath it.
The rebuilt lookup went on saying TEXT while its column was `double precision`,
so the backfill generated an assignment Postgres refused:

```
column "..." is of type double precision but expression is of type text
```

The commit lists three more copies of the same mistake — TEXT kept across
text-to-link, jsonb kept across one-many-to-many-one, DATETIME kept when the
lookup target changed from a date field to a text one. They are one bug: a copy
that should have been conditional on the shape staying the same.

## Why it is quiet

The backfill runs inside a `table.update` schema operation. The request that
started it answers normally; the operation retries until it is dead, and the
admin console will not replay it. There is nothing to catch and nothing in the
response to read. What the user has is a column that never filled in.

So the settle budget **is** the assertion — 45 seconds, well above a slow but
working backfill and far below "never".

## The fixture

A foreign table with a formula field whose expression is the literal `12.5`,
and a host with a number column holding `1` and a `manyOne` link to it. The
conversion turns the host's number column into a lookup of that formula.

Two details carry weight:

- The foreign value is a **literal** expression, so it cannot depend on
  anything else that might be slow to compute and blur what the budget is
  measuring.
- The host cell starts at `1`, a value the column can hold and the lookup
  cannot produce. A conversion that quietly leaves the old cell in place is
  then distinguishable from one whose backfill actually landed — without it,
  "still 1" and "now 12.5" would both have to be read as arrival.

`12.5` rather than a round number for the same reason as its sibling cases: an
integer survives a text round trip that a real double does not.

## The fixture check

Before the conversion, outside the checkpoint: the host row exists and its
number cell reads `1`. Without it, "the value never arrived" and "there was
never a row for it to arrive on" are the same observation.

## Group

Sibling of `computed/formula-over-text-stored-link-lookup` (T6767) and
`computed/link-lookup-added-after-rows-are-linked` (T6770). All three are the
same failure — a computed backfill whose assignment disagrees with the physical
type of the column it lands in — reached by three different sequences of
ordinary API calls, which is why they share a runner.

They are also the API-reachable half of `lookup/stale-text-metadata-recasts-on-rebuild`
and its sibling, which reach the identical mismatch by writing drifted metadata
with SQL because it is the residue of old migrations. These three need no
database access at all.
