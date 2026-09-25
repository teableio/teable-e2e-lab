# view/sort-a-date-that-hides-the-hour

**T7404** — fixed. On the `date-sort-hidden-time` runner.

## What the user sees

A date column formatted to show the day only. Several rows fall on the same
day at different hours. Sorted by that column, those rows come back in the
order they were added, not by their time. Switch the hour back on in the
column's formatting and the same sort gives a different order.

Hiding the hour is a display choice. The sort took it as an instruction.

## What the checkpoint asserts

Sorted ascending by the date column, the rows come back in the order of their
stored times - hour and minute included - worked out locally from the times
the case wrote.

## Why the fixture is shaped this way

Three rows share a day in the column's time zone (08:30, 12:00 and 18:00 in
Shanghai), and they are added in the order evening, morning, noon. A sort that
compares days only ties all three and falls back to the order they were added,
which is not their time order - the runner refuses a fixture where it would be.

A fourth row sits on the previous day and is added last, so a sort that ignored
the dates altogether would be caught too.

Outside the checkpoint the case reads every row back and checks it holds the
full time it was given. If the hour were lost on the way in, there would be
nothing for the sort to get wrong, and the case would be an error rather than a
pass.

Grouping by a day-only date is meant to keep bucketing by day; this case does
not group, and says nothing about it.

## Evidence

Run 36120798558: reproduced on `ec8e89872c` (the fix's parent) - the three same-day rows came back evening, morning, noon, the order they were added - and absent on every later column through `develop` (`37830698a4`).
