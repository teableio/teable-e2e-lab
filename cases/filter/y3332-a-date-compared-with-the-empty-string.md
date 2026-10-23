# filter/y3332-a-date-compared-with-the-empty-string

**T7949** — fixed in `fc8ee4481`.

## What the user sees

Asking for "rows that have a due date" as `{Due Date} != ""` returns an
error instead of rows, so a generated query or a saved integration that uses
the natural spelling stops working entirely.

## What the checkpoint asserts

Both queries answer; `{Due Date} != ""` returns only the dated row and
`{Due Date} = ""` only the undated one.

## What the fixture has to hold

One dated and one undated row, so each query has exactly one right answer
and a filter that ignored the condition returns both.
