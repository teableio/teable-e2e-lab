# formula/y3763-datetime-diff-counts-complete-days

**T8363** — fixed in `2bb6836d4`.

## What the user sees

A "days until" formula shows one day more (or less) than has actually passed whenever the gap is not a whole number of days.

## What the checkpoint asserts

A DATETIME_DIFF(..., 'day') formula reads 1, -1, 0 and 0 for gaps of 44 hours later, 44 hours earlier, 20 hours later and 20 hours earlier.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards: a date-only event column in America/Chicago, a start column, and four rows sharing one start time. The formula is created in Asia/Singapore, so the two time zones disagree about where a day starts.
