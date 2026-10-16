# field/y2751-a-date-converted-to-text-uses-its-own-zone

**T7817** — fixed in `40186d049`.

## What the user sees

A date column showing `2024-03-15 10:30` (Tokyo) is converted to text and
the text says something else — another format or another hour.

## What the checkpoint asserts

The conversion answers 2xx from v2 and the row reads `2024-03-15 10:30`:
the column's own format, in the column's own time zone.

## What the fixture has to hold

A time zone nine hours from UTC, so text written in UTC (01:30) and text
in the column's zone (10:30) are different.
