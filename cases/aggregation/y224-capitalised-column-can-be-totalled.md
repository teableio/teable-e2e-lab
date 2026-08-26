# aggregation/y224-capitalised-column-can-be-totalled

**T5586** — fixed.

## What the user sees

The count under a multi-select column is too high. Three rows, one of them
empty, and the summary says three are filled.

An overcount is worse than a failure: nothing looks broken, and the number goes
into whatever is being counted.

## What was measured

On the fix's parent `ea79f6cc1` the count comes back as 3 where two rows have
selections; on `develop` it is 2. Run 32666841101.

The commit is about how the aggregation functions build their column
reference — Postgres folds an unquoted identifier to lower case, so a column
stored as `TotalAmount` is only findable if the query quotes it. Whether that
is what produces this particular overcount is not established here; what the
case pins is the number the summary shows.

## Why this is most tables

Column names follow field names, and people name fields the way they name
things — Total Amount, Due Date, Owner Email. A table where no field name has a
capital letter is the exception.

## Which column shape

A multi-valued one — a multi-select — counted by how many rows have anything in
it. That is the adapter the fix touches. A plain number column named the same
way is summed correctly on the fix's parent (run 32666526545), so the
capitalisation alone is not enough; the runner keeps that shape as a config
value.

## How the case is built

One multi-select column named with capitals, three rows, one of them empty, and
a request for the count of filled ones.

Before the checkpoint the case reads the physical column name and requires it
to carry capitals too. Field names and column names are related but not the
same string, and a build that lower-cased the column on creation would make
this case about nothing at all.

## Limits

One statistic and one multi-valued type. The fix is in the shared column
reference the aggregation functions build on, so the others depend on it too,
but nothing here exercises them.
