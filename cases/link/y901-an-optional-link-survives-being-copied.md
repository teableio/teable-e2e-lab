# link/y901-an-optional-link-survives-being-copied

**T6862** — fixed.

## What the user sees

A duplicated base where rows can no longer be deleted. The message says the row
is still referenced by a required link — and there is no required link. Looking
for one finds nothing, in any table, which is where the time goes.

The original base is fine. Only the copy behaves this way, and nothing about
copying suggests it would.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## What an optional link is supposed to do

An optional link says a row may point at one of those, or at none. Rows on the
other side can be deleted, and the cells pointing at them are cleared. A
required link is the opposite and refuses the delete — that is the whole
difference between the two settings, and copying a base silently moved every
link from one to the other.

## How the case is built

A base of its own with two tables and an ordinary optional link, one row linked,
then a duplicate of that base **with its records**, and the delete aimed at a row
the copy's own order actually points at.

Both of those matter. An earlier pass tried this commit in two shapes and found
both green on the fix's parent — one of them "the same inside a duplicated
base" — and a copy with no records, or a delete aimed at a row nothing points
at, never reaches the foreign key that does the blocking.

Before the checkpoint the same kind of delete is done in the **original** base
and must succeed. That is what says the link is optional and the delete is meant
to work; without it, a refusal in the copy could just be a required link doing
its job.

## What the checkpoint asserts

The linked row in the copy deletes, and the cell that pointed at it is empty
afterwards. Both halves: an optional link that blocks the delete and one that
deletes the row but leaves a dangling name are different faults, and only the
first is this one.

## Limits

One relationship shape (many rows pointing at one) and a duplicate. The same fix
also covers base import, and the pre-check that reports which field blocks a
delete, neither of which is exercised here.
