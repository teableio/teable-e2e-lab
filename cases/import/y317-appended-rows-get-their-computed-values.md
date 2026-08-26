# import/y317-appended-rows-get-their-computed-values

**T4895** — fixed.

## What the user sees

A month's data arrives as a spreadsheet and is imported into a table that
already exists. The rows land. The columns that work things out — a total with
tax, a margin, a days-open count — are blank on exactly those rows.

A blank there reads as "nothing to work out here", not as "this was never
calculated". Sums and counts over the column come out short by exactly the
imported rows, and that is the part of a table nobody re-checks.

## What the checkpoint asserts

Every imported row has its worked-out value, polled until it settles because
the calculation is not instant. And the row that was in the table before the
import still holds its own value, so "the column is empty everywhere" is told
apart from "the imported rows were skipped".

## What the fixture has to hold

Two imported rows, so a skipped row and a failed import are different results.

The pre-existing row is read before the import and has to be worked out
already. If the column were not calculating at all, blanks afterwards would
prove nothing.
