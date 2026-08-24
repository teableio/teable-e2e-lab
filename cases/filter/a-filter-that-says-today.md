# filter/a-filter-that-says-today

**T3037** — fixed.

## What the user sees

A view filtered to "today" shows everything, or nothing.

Both are quiet failures. A view showing every row looks like one somebody
forgot to finish; an empty one looks like a quiet day. Neither says the filter
was not understood, and a relative filter is the only kind that keeps working
tomorrow — the alternative is a fixed date that has to be edited every morning.

## What the fixture has to hold

Three rows: yesterday, today, tomorrow, all at midday so each sits well inside
its own day whichever way the boundaries are worked out. With rows on both
sides of today, neither wrong answer — everything or nothing — can pass.

The rows are placed relative to the moment the case runs, not on fixed dates,
because a fixed date stops being "today" the next day.

The table is read without the filter first, so an empty answer afterwards is
the filter rather than the table.
