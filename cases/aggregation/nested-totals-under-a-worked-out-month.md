# aggregation/nested-totals-under-a-worked-out-month

**T7561** — fixed. On the `date-group-statistics` runner, with
`groupOn: "formula"` and `nestBySubject`.

## What the user sees

A grid grouped by a formula that copies a date formatted as a month, with a
second grouping level under it. Some group headings print their total and
some print nothing. The total at the foot of the table is right.

The headings with no total are the ones whose rows do not sit at the very
start of the month. The list keyed a formula date's groups by the raw time,
while the totals keyed them by the month on screen, so the two did not meet.

The plain date column had the same fault and was fixed earlier (T7060, the
`y1281` and `y1284` cases on the same runner).

## What the checkpoint asserts

- the total at the foot of the table is right;
- every month heading has a total, and they add up per month;
- every second-level heading has a total, and there are as many second-level
  headings as there are (month, subject) pairs, with the right totals.

## Why the fixture is shaped this way

The rows are the ones in the fix's own test: one at the very start of April
in Shanghai, two later in April (one with a subject), and one in June. The
first is the row that used to work.

Both heading counts, month and second level, are checked inside the
checkpoint, not as fixture verification. On the pre-fix side the list itself
split each month by raw time - 4 month headings where 2 belong, 4 second-level
headings where 3 belong - so a count checked outside would make that column
read "could not run" instead of "reproduced". (Grouped on the plain date
column, the month count stays outside: there it was always right.)

## Evidence

Runs 36121868574 and 36122313679, while the counts were still checked outside
the checkpoint: on `b4908f0a4d` (the fix's parent) the list showed 4 month
headings where 2 belong and 4 second-level headings where 3 belong; absent on
every later column.
