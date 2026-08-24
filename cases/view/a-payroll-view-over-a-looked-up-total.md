# view/a-payroll-view-over-a-looked-up-total

**T6912** — fixed.

## What the user sees

A payroll view that will not open. The error names a totalling rule nobody
wrote, and the person has no way to find it in the interface.

The sheet is an ordinary one. Rate changes live on their own rows; each
employee carries the highest of them; each payroll line borrows that rate and
the employee's site so the view can be filtered by site. Every column was made
the way the field dialog makes it — nothing unusual, nothing hand-edited.

The looked-up total is stored without the settings that say what it totals.
That copy is enough to display the column and not enough to load the table it
sits on, so the whole payroll table stops loading.

## What the checkpoint asserts

The column that borrows the total is created, a payroll line is added, the
filtered view is created, and the view lists that line with both borrowed
values — its site and its rate.

All four are inside the checkpoint on purpose: the table stops loading as soon
as the column exists, so which of the four is refused first is a detail of the
build, not of the bug.

## What the fixture has to hold

The middle of the chain works before the near end is built: the employee's
highest rate reads back as the seeded rate. Without it, an empty payroll column
and an unloadable payroll table would look the same.

Two sites, so a filter that kept everything and a filter that kept the right
rows are distinguishable.

## Relationship to the SQL-written sibling

`record/a-row-when-a-looked-up-total-lost-its-rule` (T6911) reaches the same
missing rule by writing it with SQL. That case stays green on this fix's parent
— measured, run 32705941080 — because the state it writes and the state the
ordinary requests produce are not the same. This case builds the chain through
the public API only.
