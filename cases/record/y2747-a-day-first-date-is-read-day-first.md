# record/y2747-a-day-first-date-is-read-day-first

**T7814** — fixed in `40186d049`.

## What the user sees

An import into a day-first date column moves every date whose day is 12 or
less into another month, and answers success for every row.

## What the checkpoint asserts

The write answers 2xx from v2 and the row holds 4 March 2024 at midnight in
the column's zone (`2024-03-03T16:00:00.000Z`).

## What the fixture has to hold

A day and a month that are both 12 or less, so either reading parses and
only the column's format can decide.
