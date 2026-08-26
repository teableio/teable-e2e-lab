# table/y323-usable-after-a-refused-column-change

**T4661** — fixed.

## What the user sees

Two things, and the case measures both.

Turning on "must be filled in" for a column that already has an empty cell is
accepted. The rule is on, the empty row is still there, and nothing will ever
say so: the table holds a row its own rule forbids, and the next person to
trust that rule is working is wrong.

And when a change _is_ refused, the person's next step — fill the gaps, try
again — was not available. The failed attempt left the table marked as not finished being
set up, and everything after it was refused as well: reading the table, adding
a row, changing the column back. One rejected settings change and the table was
gone until someone with database access lifted the mark.

## What the checkpoint asserts

First that the change is refused. That is where the two builds differ: the
fix's parent accepts it (measured in run 32692913219), leaving the rule on over
a row that breaks it.

Then everything the person would do next: the rows read back, a new row can be
added and holds what was sent, and another change to the same column is
accepted. Being able to retry is what a refusal is supposed to leave intact,
and that is the fix's own subject.

## An earlier shape, and why it was dropped

"No duplicates" over a column with a repeated value is turned away by
validation before the change is attempted at all, so it never reaches the part
that could leave the table marked unfinished. Green on both columns, run 32692598187.

## What the fixture has to hold

A column with an empty cell — the runner refuses a fixture without one.

It is deliberately not "no duplicates" over a repeated value: that change is
turned away by validation before it is attempted at all, so it never reaches
the part that could leave the table marked unfinished. Measured in run
32692598187, green on both columns.
