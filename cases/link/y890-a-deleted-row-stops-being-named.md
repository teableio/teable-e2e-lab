# link/y890-a-deleted-row-stops-being-named

**T7291** — fixed.

## What the user sees

A row is deleted, and a cell in another table still names it. The name is shown,
counts and filters still include it, and opening it finds nothing.

The table where the damage shows is not the table anybody deleted from, which
is why the two are rarely connected.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## How long the fault existed

Hours. The preflight that skips the cleanup arrived in `f973f3d20` and the
repair in `542679839`, both on 2026-09-11, with two more commits of the same
series between them. So this case guards a door that was only briefly open —
which is what makes it worth pinning: the shape reached `develop` once, and the
behaviour it protects is the one everybody depends on.

## Why this link shape

Clearing a deleted row out of the cells that name it is done by looking at what
the link is made of. For a two-way link between one row here and many rows
there, those pieces are split across the two tables: the key sits on the rows
being deleted, and the column that displays them sits on the other side. The
cleanup looked for both on the table being deleted from, did not find one, and
skipped.

## Not the same as y245

`link/y245-deleting-a-row-clears-links-pointing-at-it` is the same symptom for a
one-way many-to-one link written by an older version of the product. This one is
an ordinary two-way one-to-many link, built through the public API today, and
the reason the cleanup skips it is different.

## How the case is built

Two tables, an ordinary two-way one-to-many link, one host row linked to two
rows, and then one of those two deleted.

Before the checkpoint the cell is read and must list both linked rows by name: a
cell that was never filled in cannot be observed to lose anything.

## What the checkpoint asserts

The deleted row's name is gone from the cell within the settle window, and the
other linked row is still there. A cleanup that emptied the cell altogether
would also make the deleted name disappear, and would be worse than the fault.

## Limits

One link shape and one deletion. The fix also repairs the preflight for
many-to-many and one-way hosts, which are not exercised here.
