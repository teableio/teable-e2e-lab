# table/y2839-a-duplicated-table-keeps-its-rows

**T7783** — fixed in `df36def32`.

## What the user sees

Duplicating a table "with records" produces a table with all the right
columns and no rows. Nothing says the copy failed; it simply looks like a
table nobody has filled in yet. The usual reason to copy a table is to start
the next period from this one, so the loss is noticed late.

## What the checkpoint asserts

The duplicate answers 2xx from v2, and the copy holds the surviving rows in
order with:

- row numbers 1, 2, 3 — not the source's 1, 3, 4;
- a created time at the moment of copying, not the source's;
- an empty last-modified time and last-modified-by, since nobody has edited
  the copy yet.

## What the fixture has to hold

A row deleted from the middle, so carried-over numbers (1, 3, 4) and
renumbered ones (1, 2, 3) differ — the runner refuses an end row. Every source
row is edited once before the copy, so the source has a change history the
copy must not inherit, and the source rows are aged by a couple of seconds so
the two created times are different instants.
