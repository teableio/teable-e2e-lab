# field/y2752-text-converted-to-a-date-lands-on-local-midnight

**T7818** — fixed in `40186d049`.

## What the user sees

A text column of dates becomes a date column, and the dates are stored for
midnight in another zone — in a zone ahead of UTC that can show as the
previous or next day.

## What the checkpoint asserts

The conversion answers 2xx from v2; `2024-03-15` becomes midnight in
Shanghai (`2024-03-14T16:00:00.000Z`) and text that is not a date is
cleared.

## What the fixture has to hold

A target zone eight hours ahead of UTC, so UTC midnight and Shanghai
midnight are different instants; one unparseable value as the control.
