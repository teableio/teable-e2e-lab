# lookup/stale-text-metadata-survives-display-convert

**Bug:** T6805 — `table.update` computed backfill died with
`column "..." is of type double precision but expression is of type text`
(Sentry BACKEND-AI-1F6).

## What broke

The same drift as its sibling case: a lookup's stored `db_field_type` left
saying `TEXT` while the physical column is `double precision`. The backfill
generated its assignment from the metadata, Postgres refused it, and the schema
operation went dead where no caller could see it.

What separates this case is the **trigger**. Here the rebuild is a display-only
convert — the number's formatting precision changes, and nothing else. No value
in that column can possibly move as a result. A rebuild still runs, because the
lookup was pending, and it still has to derive the physical type from the
column rather than trusting the metadata it was handed.

That is the sharper statement of the rule, and it is the one production
arrived at: not "recompute correctly when the query changes" but "never trust
the stored type, even when the request could not have changed a single value".

## Reproduction

`peer ← foreign(number) ← host(link)`, then:

1. Build a number lookup on the host with currency formatting, and let it fill
   in.
2. `UPDATE field SET db_field_type = 'TEXT', cell_value_type = 'string'` on the
   lookup — SQL, see the sibling case for why.
3. Convert the lookup with **identical** lookup options and a different
   formatting precision.

Before the fix, step 3 fails on the type mismatch and the value never comes
back. After it, the cell fills in again.

## What the checkpoint asserts

That the lookup holds 12.5 again within the settle budget. The timeout is the
assertion — in production nothing is raised at the caller, the cell just stays
as it was.

Fixture verification, outside the checkpoint: the lookup resolves before the
metadata is touched.

## Why this is a separate case from its sibling

`lookup/stale-text-metadata-recasts-on-rebuild` (T6836) covers the same drift
reached by a semantic change — adding a filter — and covers the `jsonb` column
as well as the `double precision` one. This case pins the weaker trigger, and
the two were fixed by different commits. If the comparison table ever shows
them flipping green on the same commit, this one has stopped earning its place
and should be removed rather than kept for symmetry.

## Why the data looks like this

Number only. The reported column was `double precision`, and a lookup over a
link field has no formatting for a display-only convert to change — pairing
them would leave the case with no trigger at all, which the runner refuses
rather than allowing it to pass on a rebuild that never ran.

`sourceNumber` is 12.5 rather than an integer: an integer survives a text round
trip that a real double does not, and would mask the mismatch under test.
