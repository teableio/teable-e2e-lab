# formula/change-only-the-time-zone-a-date-is-shown-in

**T1710** — fixed.

## What the user sees

A worked-out date column that quietly stops computing what they wrote.

The time zone a date is displayed in is a display setting. Changing it says
nothing about how the date is arrived at: the person is making the column
readable for a team in another country, not editing their formula.

The formula was replaced with the time the row was last touched. What the
column shows afterwards is a plausible date, on every row, and the rule they
wrote is not recoverable from anywhere on screen. The only way to notice is to
open the column's settings again and read what is there now.

## What the checkpoint asserts

After the time zone is changed, the rule the product reports for the column is
the rule the person wrote — and the time zone really did change, so "the edit
did not take" stays a different report.

## What the fixture has to hold

The column carries the rule as written before the change. A rule that never
landed would have the checkpoint comparing a wrong thing against a wrong thing.

## Why the values are not the observation

What the replaced rule computes looks like a date on every row. Values that
look right are exactly what makes this hard to see, so the case reads the rule
instead.
