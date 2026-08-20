# lookup/stale-text-metadata-recasts-on-rebuild

**Bug:** T6836 — `table.update` computed backfill died with
`column "..." is of type jsonb but expression is of type text`
(Sentry BACKEND-AI-1FD / -1FE).

## What broke

A lookup's `db_field_type` is metadata describing a column that already
exists. The backfill generated its column assignment from that metadata rather
than from the column, so once the two drifted apart the generated SQL was
simply wrong: a text expression assigned into `double precision`, or into
`jsonb`. Postgres refused it.

The refusal did not reach the caller. The backfill runs inside a `table.update`
schema operation, so what happened instead was that the operation went dead —
non-retryable, and not something the admin console will replay. What the user
had was a lookup column that stopped filling in, and a compute panel quoting
Postgres at them.

The drift itself is ordinary residue: metadata left saying `TEXT` from an
earlier shape of the field while the physical column had already moved on. The
same customer table produced this failure more than once (T6765 and T6805 are
siblings on it), which is what makes it worth a case rather than a one-off.

## Reproduction

`peer ← foreign(number, link) ← host(link)`, then:

1. Build a number lookup and a link lookup on the host, and let them fill in.
2. `UPDATE field SET db_field_type = 'TEXT', cell_value_type = 'string'` on
   both lookups — SQL, see below.
3. Convert each lookup, adding a filter to its options, which is what makes the
   rebuild run.

Before the fix, step 3 fails on the type mismatch and the values never come
back. After it, both cells fill in again.

## What the checkpoint asserts

That both lookups hold their values again within the settle budget — the
number lookup reads 12.5 and the link lookup contains the peer's title.

The timeout is the assertion. In production the failure raises nothing at the
caller: the cell simply stays as it was, because the operation dies out of
band. A case that only waited for an error would have nothing to catch.

Fixture verification, outside the checkpoint: both lookups resolve **before**
the metadata is touched. Without it, "the drift broke the rebuild" and "these
lookups never worked" look the same.

## Why the data looks like this

Two lookups, not one, because both physical types were reported and they fail
differently: a number lookup is stored as `double precision`, a lookup over a
link field as `jsonb`.

`sourceNumber` is 12.5 rather than an integer — an integer survives a text
round trip that a real double does not, so it could mask the very mismatch
under test.

The rebuild is triggered by **adding a filter**, not by re-submitting the same
options. Re-submitting identical options is a no-op: no backfill runs, and the
case would read back the values the first, pre-drift pass left in the column
and call it a pass.

The drift is written with SQL because no sequence of API calls produces it
today — it is the residue of a field's earlier shape, which is exactly what
`fixture-db` is for. Everything observed is the ordinary record read.
