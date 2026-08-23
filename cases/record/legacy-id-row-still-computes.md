# record/legacy-id-row-still-computes

**T6621** — fixed.

## What the user sees

A table where some rows compute and others never do. The formula is the same
for every row, the values look the same, and nothing on screen distinguishes
the rows that work from the ones that do not.

## Why

v1 only enforced the `rec` prefix on record ids. Ids that came in through an
import or a migration can therefore have a body that is not the sixteen
characters this version generates. v2 parsed ids strictly, so those rows failed
their computed update — deterministically, the same failure every time,
classified as a code bug and sent straight to the dead letter table rather than
retried.

Record ids are not a thing anyone looks at, which is what makes this hard to
report: the affected rows are the ones that came from somewhere else, and there
is no way to see that from the grid.

## How the case is built

Four rows and a formula, all computing normally, then one row is given a
legacy-shaped id with SQL. The product cannot mint one — generation moved to
the strict format, and every id it writes today is canonical — so this is what
an old row looks like rather than what a new one can be made into.

The id's shape is checked before anything is built: it has to keep the `rec`
prefix that v1 did enforce, and it must not have a canonical sixteen-character
body, which would make it exactly what this version generates and nothing about
it legacy.

Then one write changes every row's source value, the migrated row included, so
they recompute together. The assertion is that every row's formula result
follows — the ordinary rows are what show whether the one unparseable row took
the batch with it.

Before the checkpoint the case reads the rows back twice over: the migrated row
has to answer with the id the fixture gave it, and every row has to already
compute the seed value. Without the second check, "the rows stopped computing"
would be describing a formula that never worked.

## Limits

One legacy id shape, eight characters of body. The fix accepts one to
sixty-four; nothing here explores that range, and nothing here covers the other
half of the change — `RecordId.isCanonical`, which keeps paste's link
auto-resolve from mistaking user text like "recipe" for a record id.
