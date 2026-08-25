# record/delete-a-row-whose-link-records-disagree

**T1516** — fixed.

## What the user sees

A row that will not delete, and a message about a constraint.

A many-to-many link is kept in two places: a cell on each row, and a separate
record of the pairing. They are written together and are supposed to agree.
Bases that have been through imports, restores and older versions have rows
where they do not — the pairing is recorded and one of the cells is blank.

Deleting such a row was refused. Nothing on screen explains it, because the
thing being complained about is not something a person can see or reach: the
row looks ordinary, the delete is ordinary, and it simply will not go. Trying
from the other side does not help either.

## What the checkpoint asserts

The row is deleted, and the row nobody touched is still there — so a delete
that took more than it was asked to stays a different report.

## What the fixture has to hold

The pairing is in place on both sides before it is broken. A row that was never
paired could not show a delete refused because of the pairing.

The disagreement is made with SQL: no request produces it, and a pair of
records that agree cannot show the difference.
