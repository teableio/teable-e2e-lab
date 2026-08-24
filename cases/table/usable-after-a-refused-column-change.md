# table/usable-after-a-refused-column-change

**T4661** — fixed.

## What the user sees

Turning on "must be filled in" for a column that already has an empty cell is
refused. That is correct, and the person's next step is to fill the gaps and
try again.

They could not. The failed attempt left the table marked as not finished being
set up, and everything after it was refused as well: reading the table, adding
a row, changing the column back. One rejected settings change and the table was
gone until someone with database access lifted the mark.

## What the checkpoint asserts

Everything the person would do next, in order: the rows read back, a new row
can be added and holds what was sent, and another change to the same column is
accepted. The last one is the point — being able to retry is what the failure
was supposed to leave intact.

## What is deliberately outside the checkpoint

The refused change itself. It fails on both sides of the fix, as it should, so
it is setup rather than the subject. The runner does check it was refused: if
the change went through there would be no failure to recover from and the case
would be asserting nothing.

## What the fixture has to hold

A column with an empty cell — the runner refuses a fixture without one.

It is deliberately not "no duplicates" over a repeated value: that change is
turned away by validation before it is attempted at all, so it never reaches
the part that could leave the table marked unfinished. Measured in run
32692598187, green on both columns.
