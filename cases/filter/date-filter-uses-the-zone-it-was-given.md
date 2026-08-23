# filter/date-filter-uses-the-zone-it-was-given

**T5583** — fixed. On the `legacy-date-filter` runner; its sibling is
`filter/plain-date-string-filters-a-date-column`.

## What the user sees

A filter for one day returns the neighbouring day's rows. Not an error, not an
empty table — a plausible list of the wrong records.

## Why

The filter panel saves an exact date together with the zone that decides which
day that date is. Matching ignored the zone and used UTC, so any deployment
east of it — which is where the lab runs its server, and where the official
image runs by default — answers for a different day than the one on screen.

## Which comparison

`isOnOrAfter`, not `is`. Asking for one day already honoured the zone on the
fix's parent — measured, run 32665470824 — so the case moved to a boundary,
which is where a mishandled zone shows most sharply: a row a few hours before
local midnight is the previous day locally and the same day in UTC.

## What the fixture holds

Two instants that are both the 12th in UTC, in a column whose zone is UTC+8.
One of them is 00:30 on the 13th there; the other is 23:00 on the 12th. A third
row is comfortably the 11th in both.

Asked for everything on or after the 13th **in that zone**, the answer is the
first row alone. A filter that falls back to UTC sees both as the 12th and
answers with neither. Neither answer is an error — the difference is which rows
a person is looking at.

## Its sibling

`filter/plain-date-string-filters-a-date-column` sends the same filter as a
bare date string, which is what a v1-era client does. Same column, same
operator, two different failures — one matched nothing, this one matches the
wrong day.
