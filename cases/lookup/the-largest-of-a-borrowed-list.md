# lookup/the-largest-of-a-borrowed-list

**T7099** — fixed. On the `jsonb-lookup-aggregate` runner.

## What the user sees

A report row is given a column totalling across the teams it matches, asking for
the **largest** amount. The column cannot be made: the request comes back
refused, with the database's own words about a function that does not exist.
Smallest behaves the same way. Sum and average over the very same source column
build fine, which makes it look like something about this particular field
rather than about the function.

The field editor offered all four.

## Why

The team row borrows every task's amount, so that column holds a list rather
than one value — that is what borrowing across a one-to-many produces. Sum and
average had been taught to look inside such a list before adding up. Largest,
smallest, all-of and any-of had not: they were applied to the stored list
directly, and Postgres has no largest-of-a-list and will not read a list as a
yes/no. The computation failed and the column never produced anything.

## What the checkpoint asserts

Asking for the total is itself inside the checkpoint, because asking is what
fails — before the fix the create is refused outright. Building the chain the
column reads from is setup; asking the question is the observation. Kept the
other way round, the same failure would score as "this case could not run here"
rather than as the bug.

Each requested total then reads its correct answer, **and** the product does not
mark any of those columns broken. Both directions matter: a column that reads
correctly while still flagged as broken, or one flagged fine while empty, are
each half a fix. The failure message carries both the values read and the broken
list, so a red column says which of the two happened.

## Why the fixture is a chain of three tables

Two will not do it. The source column has to hold a list, and a column only
becomes a list by borrowing across a one-to-many — so there is a leaf table with
the values, a middle table borrowing them, and a host table totalling across the
middle. A total taken straight off a plain number column takes a different path
and answers correctly on both sides of the fix.

The fixture checks that the borrowed columns really do hold lists before going
on, because if they held single values the case would be watching the path that
already worked.

The expected answers are worked out from the list the product actually built,
read back off the middle row — not from the leaf rows the case seeded. Those are
not the same thing, and asserting against the seed would be asserting against
this case's model of the product rather than against the product. The runner
then refuses a fixture whose borrowed amounts are all equal, since largest and
smallest could not be told apart.

## Why the tickbox half is not here

The same fix repaired all-of and any-of over borrowed tickboxes, and this case
deliberately does not cover them. An unticked box does not reach a borrowed list
at all: a pair of leaves, one ticked and one not, produces the borrowed list
`[true]` — measured, not assumed. All-of and any-of over that list both answer
true whether they work or not, so a case built on it would be green on every
column.

Covering that half needs a source list that can hold `false`, which a borrowed
tickbox column does not appear to produce. The runner refuses the boolean
aggregations rather than asking a question it cannot tell the answer to.

## Only v2 has this column

Conditional totals are a v2 column type. There is no field on the older engine to ask this of.
