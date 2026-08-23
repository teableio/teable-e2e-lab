# aggregation/capitalised-column-can-be-totalled

**T5586** — fixed.

## What the user sees

The summary under a column shows nothing, or the request behind it fails. The
column holds numbers and looks entirely ordinary; what is unusual about it is
that its name has capital letters.

## Why

Postgres folds an unquoted identifier to lower case. A column stored as
`TotalAmount` is therefore only findable if the query quotes it, and the
aggregation query did not.

That number is not a decoration: it is what the grid shows under the column,
and every summary row and group total is made of it.

## Why this is most tables

Column names follow field names, and people name fields the way they name
things — Total Amount, Due Date, Owner Email. A table where no field name has a
capital letter is the exception.

## How the case is built

One number column named with capitals, three rows, and a request for the sum.

Before the checkpoint the case reads the physical column name and requires it
to carry capitals too. Field names and column names are related but not the
same string, and a build that lower-cased the column on creation would make
this case about nothing at all.

## Limits

One statistic, `sum`. The fix is in the shared reference the aggregation
functions build on, so the others share it, but nothing here exercises them.
