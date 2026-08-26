# record/a-deleted-row-in-the-trash

**T1980** — fixed.

## What the user sees

Nothing, until the day they go looking.

The trash is the promise that a delete is not final. It is what makes deleting
a row an ordinary thing to do rather than a decision: someone clears out what
looks like a duplicate, and if they were wrong it is there to be put back.

The rows were not being written to it. The delete works and the row is gone, so
there is nothing to notice at the time. By the time anyone looks, the row is
not recoverable and nobody can say when it went — and an empty trash is not
read as "this is broken", it is read as "I must have deleted it somewhere
else".

## What the checkpoint asserts

The row really left the table, and the table's trash holds an entry naming it.

The first half matters: with no delete, "nothing is in the trash" would be the
correct answer and a different report.

## What the fixture has to hold

The table's trash is empty to begin with, so anything found afterwards came
from this delete.

## Why the case waits

What goes into the trash is written after the delete answers, so the case polls
until the entry appears or the attempts run out.
