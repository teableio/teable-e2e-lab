# selection/y188-paste-by-id-lands-on-its-own-rows

**Sentinel** — `sentinel/paste-by-id-alignment`. There is no bug behind this
case, and **no commit where it goes red.** Read the limits section before
trusting it the way you would trust the others here.

## What it guards

Paste a column of distinct values into a list of records by id, and every value
lands on the record it was addressed to — and a paste naming a record that does
not exist is refused rather than quietly dropped.

Selection paste used to load one record per row, a table load each, and was
rewritten to batch them into a single query. That is the right fix for what it
was: the fan-out is what made a large paste slow.

What the rewrite also does is move a guarantee out of the language and into the
code. `Promise.all` over a list of ids comes back in order and throws when a
record is missing; a batched loader comes back as a **map**, while the clipboard
payload stays **positional**. Any row the loader cannot resolve is now a row
that has to be noticed on purpose, because dropping it slides every later value
one target up.

The fix that batched the reads carries an explicit `throwOnMissing` for exactly
that reason. This case is the outside check on that decision.

## Why the failure would be quiet

A shifted paste answers 200. The right number of cells change. The user sees a
grid full of their own data, one row out of place, with nothing to connect it
to the paste that did it — and the wrong values are plausible, because they are
the values they pasted.

That is the shape that earns a sentinel. A failure that shows up as an error
does not need a tripwire; one that shows up as a table that looks fine does.

## What the checkpoint asserts

1. The paste answered 2xx.
2. Every row holds **its own** value, compared row by row, and the error names
   the row label and both values rather than reporting a count.
3. The `Label` column, which was never part of the paste, is untouched — if it
   moved, rows were rewritten rather than cells, which is worse than a shift.
4. A second paste that names a record id which does not exist is **refused**
   with a 4xx, and nothing was written by it.

Assertion 4 is the mechanism behind assertion 2, which is why they live in one
case: dropping the unknown row instead of refusing is precisely how the later
values would slide.

## Limits — read this before relying on it

This case cannot be validated the way the reproductions in this repository are.
It was written as one — against the commit before the batching rewrite — and it
was **green there too**, because the code it replaced held the same guarantee by
accident of using `Promise.all`. Running it across history produces green
everywhere. For a normal case that means the case is broken; here it is
expected.

So it does not prove it would catch a regression. What it buys is narrower: the
next change to this loader has to keep the payload aligned, or a column turns
red naming the row that holds someone else's value.

If it ever does go red, treat it as a real finding rather than assuming the case
rotted — every value it compares was written by the case itself.

## Why the data looks like this

Sixty rows, each with a label and a value that could not belong to any other
row: `row-7` holding `after-6` is unmistakable, where a table of repeated
values would hide a shift completely.

Sixty rather than a handful because a batched loader pages, and a shift that
only appears across a page boundary would be invisible in a fixture small
enough to fit in one. The runner refuses fewer than three rows outright — below
that, a shift by one row and a single wrong cell are the same observation.

## The other half of that fix

The fan-out this rewrite removed — one table load per pasted row — is a
performance shape, and it belongs in the performance lab rather than here. This
case says nothing about how long a paste takes; it only says where the values
land.
