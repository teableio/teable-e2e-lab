# undo/delete-records-undo-restores-all

**Sentinel** — `sentinel/delete-undo-restores-all`. There is no bug behind this
case, and **no commit where it goes red.** Read the limits section before
trusting it the way you would trust the others here.

## What it guards

Delete every row in a table, undo, and get the table back: same rows, same
order, same cells.

The delete path was rewritten three times in two weeks, and every one of those
changes removed something in the name of speed — trash persistence folded into
the delete transaction, the per-row trash markers replaced by a single index
row, undo snapshots skipped for conversions that cannot change a value. Each is
a reasonable optimisation. Each also removes something undo might have been
relying on.

What makes the path worth guarding rather than trusting is the **shape** of the
failure. Undo would still answer `fulfilled`. It would just bring back less
than it took — fewer rows, or rows with empty cells — and nothing in the
response would say so. A user would find out later, looking at a table that is
quietly missing data, with no error anywhere to connect it to.

## What the checkpoint asserts

Four things, in order, because each one can pass while the next fails:

1. The delete emptied the table. Otherwise "everything came back" is trivially
   true.
2. Undo reported `fulfilled`.
3. Every row is back — the count matches.
4. Same record ids in the same order, and **every cell equal to what it was**.

Step 4 is the one that earns the case. A restore that brings the rows back
blank passes the count check, and a restore that reinserts them as new records
passes both the count and the cell checks while giving the user a table whose
rows have lost their identity.

## Limits — read this before relying on it

This case cannot be validated the way every other case in this repository is.
There is no pre-fix column where it reproduces, because the behaviour it
guards has always been correct. Running it across history produces green
everywhere, and for a normal case that means the case is broken; here it is
expected.

So this case does not prove that it would catch a regression. It has never
caught one. What it buys is narrower and still worth having: the next change to
the delete path has to keep undo whole, or a column turns red naming the row
and the cell that went missing.

If it ever does go red, treat it as a real finding rather than assuming the
case rotted — the assertions are all on values this case wrote itself.

## Why the data looks like this

Twelve rows, and every row differs from every other in all three fields — a
distinct title, an ascending number, an alternating checkbox. A restore that
brings rows back with someone else's values, or with blanks, cannot pass
unnoticed against that.

More than one row is mandatory and the runner enforces it: a single row can
only ever be all-or-nothing, and **partial** restore is the failure this
exists for.

The window id carries the runId. The undo stack is keyed by it, so the delete
and the undo must use the same one — and it must not be a value another run
could share, or this case could undo an entry it did not create.
