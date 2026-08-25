# record/archive-the-rows-a-count-was-counting

**T6668** — fixed.

## What the user sees

A count that keeps counting rows that are no longer in the table.

Archiving is how a team puts finished work away without losing it: the rows
leave the table, and the point of archiving rather than deleting is that they
can be read back later. The columns counting those rows did not come down.

A column reading "3 open items" over a table with no open items left is not a
stale number somebody notices and refreshes. It is the number the team plans
around, it is the only place they look, and nothing on screen suggests the
count and the rows disagree.

## What the checkpoint asserts

1. The archived rows really left the table.
2. Every count came down.

The first is not decoration: a count that stayed at one would be _correct_ if
the archive had done nothing at all, and that is a different report.

## What the fixture has to hold

Every owner counts their one row before anything is archived. A count that was
always empty would pass the checkpoint by accident.

Three owners, so a count that went to zero everywhere and a count that followed
the condition stay distinguishable.

## Why the count is by condition and not by link

The same archive already brought linked counts down. The shape that did not is
the one where the two tables are connected by matching values rather than by a
link, which is how this fixture builds it.
