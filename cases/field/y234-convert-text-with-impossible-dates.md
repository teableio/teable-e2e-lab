# field/y234-convert-text-with-impossible-dates

**T6519** — fixed.

## What the user sees

A column that started as free text is turned into a date column — the tidying
up that follows an import, or that a column does once people have been typing
into it for a while. The conversion is refused. The column stays text.

The values that stopped it are the ordinary contents of a hand-typed column: a
February 30th, a month 13, a word instead of a date. The message names the
value, not the row it is in, so finding it is the user's problem in a table of
any size.

## What the checkpoint asserts

The conversion completes, the impossible values come out empty, and the one
real date comes out as a date. The last part is what makes the assertion
two-sided: a conversion that emptied the whole column would otherwise look like
a fix.

## What the fixture has to hold

At least one value that is not a date and one that is — the runner refuses
otherwise. Five of the six here are wrong in different ways, including
`2026-02-29`, which is the shape that gets through a format check and fails on
the calendar.

The text is read back before the conversion. If the text column had already
rejected these values there would be nothing for the conversion to trip over,
and every commit would pass.
