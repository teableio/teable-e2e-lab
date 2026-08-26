# filter/a-filter-on-a-time-of-day

**T1611** — fixed.

## What the user sees

A filter that returns the whole day when they asked for part of it.

A date column that shows the time is used for things that happen during a day:
shifts, deliveries, calls. Filtering to "after 23:36" is the ordinary use of
such a column, and the minute is the whole point — a person picking that time
means it.

The time was thrown away and only the day compared. Everything on that day
landed on the same side of the line, and the rows that come back look right,
because they are all from the day that was asked about.

## What the checkpoint asserts

Filtering to the rows after a particular minute returns exactly those rows.

## What the fixture has to hold

Unfiltered, every row is there — a table short of rows would make the filtered
answer unreadable.

A control first: the same filter with a cutoff before every row keeps every
row. Without it an empty answer could be this case asking the question wrongly
rather than the product answering it wrongly.

That control is what settled how to ask. Passing the filter alongside the read
is answered with nothing at all on develop and with everything on the fix's
parent — neither of which is the product filtering — so the case saves the
filter on the view and then reads the view, which is what a person does:
set it in the toolbar and look at the table. Measured over runs 32915607313 and 32916759955.

All the rows fall on one day and are minutes apart, with at least one on each
side of the cutoff. A filter comparing only the day cannot tell them apart, and
one comparing the minute has to. The runner refuses any other fixture.
