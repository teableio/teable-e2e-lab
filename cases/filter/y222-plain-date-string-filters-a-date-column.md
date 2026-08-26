# filter/y222-plain-date-string-filters-a-date-column

**T5584** — fixed.

## What the user sees

A filter that returns nothing. Not an error — an empty table, which reads as
"there is nothing on that date". A report built on it is quietly wrong rather
than visibly broken, which is the worst way for a filter to fail.

## Why

A date filter has a shape: a mode, a date, a time zone. v1 also took the date
on its own, so clients written against it send the bare string — a saved view's
filter carried forward, a script that builds a query, a report that asks for
everything dated the 12th.

v2 did not recognise it, and an unrecognised filter value matched nothing.

## How the case is built

Three rows across two days, and a filter asking for one of them.

Both rows on the filtered day and a row on another one are required. With only
matching rows, a filter that was ignored entirely would return everything and
look correct; with only non-matching rows, one that matched nothing would. The
fixture catches both, and the failure message says which happened — including
the one-row case, which means the instant was matched rather than the day.

Two rows share the filtered day at different times, and that distinction is the
sharp end of this case: `is` on a date column means the same **day**, not the
same instant. Measured on `develop` in run 32664447076, a filter naming 09:00
returns the 18:30 row as well; on the fix's parent it returned only the exact
instant. The first version of this case expected string equality and failed on
the fixed build for that reason.

## Limits

One operator, `is`. The fix covers the comparison operators as a set —
`isNot`, `isBefore`, `isAfter`, `isOnOrBefore`, `isOnOrAfter` — and nothing
here exercises them.
