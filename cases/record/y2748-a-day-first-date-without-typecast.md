# record/y2748-a-day-first-date-without-typecast

**T7815** — fixed in `40186d049`.

## What the user sees

A client that sends dates in the same format the column displays them in
gets a validation error, and has to switch on typecast — with all its other
conversions — just to store a date.

## What the checkpoint asserts

The write, without typecast, answers 2xx from v2 and the row holds 15 March
2024 at midnight in the column's zone (`2024-03-14T16:00:00.000Z`).

## What the fixture has to hold

A day above 12, so the text can only be read day-first — the question is
whether it is read at all, not which way round.
