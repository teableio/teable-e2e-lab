# filter/y576-filter-a-worked-out-yes-no-column

**T1613** — fixed.

## What the user sees

A filter on a worked-out yes/no column that returns the wrong rows, and no way
to tell.

A worked-out yes/no column is how a table answers a question about itself: over
budget, past due, big enough to review. Filtering to the rows where it says yes
is the only reason to have one — nobody reads the column, they read the rows it
selects.

The filter did not select them. The rows that come back all look plausible, the
column says what it says on each of them, the count at the top agrees with the
wrong list, and the rows that are missing are missing quietly.

## What the checkpoint asserts

Filtering to the rows where the column says yes returns exactly those rows, and
filtering to the rest returns exactly the rest.

## What the fixture has to hold

The column says yes on exactly the rows the fixture declares, read back before
either filter runs. A column that answered nothing would make both filters
correct by returning nothing.

Rows on both sides of the line, or a filter that returns everything and a
correct one would look the same.

One row with no amount at all. The rows where the answer is no include the rows
where there is no answer yet — a blank source has nothing to compare — and a
filter that dropped those is wrong in a way that only shows on half-filled
tables.
