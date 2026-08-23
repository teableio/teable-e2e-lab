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

## What the fixture holds

Three instants that are all the 12th in UTC, and a column whose zone is UTC+8.
Two of them are the 13th there; one is still the 12th.

That split is the whole case. A filter that uses the zone returns the two; one
that falls back to UTC returns all three. Neither answer is empty, and neither
is an error — the difference is which rows a person is looking at.

## Its sibling

`filter/plain-date-string-filters-a-date-column` sends the same filter as a
bare date string, which is what a v1-era client does. Same column, same
operator, two different failures — one matched nothing, this one matches the
wrong day.
