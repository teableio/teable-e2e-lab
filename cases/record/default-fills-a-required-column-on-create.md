# record/default-fills-a-required-column-on-create

**T5686** — fixed. The lead case of two on the `required-default` runner; the
sibling is `field/required-default-backfills-existing-rows`.

## What the user sees

A column is marked required and given a default. Creating a record without
filling that column is refused for leaving it empty — by the same table that
was just told what to put there.

## Why

"Required" and "has a default" are a pair: the default is the answer for
everyone who does not supply one. Marking a column required and giving it a
default is how a table says "this always has a value, and here is the usual
one".

The validation ran before the default was applied, so it judged a cell that was
only briefly empty.

## What the checkpoint asserts

The request succeeds **and** the row holds the default. A request that
succeeded while leaving the cell empty would be the same column without its
promise, and the requirement is the promise.

The request goes through raw axios with the status left open: it is the request
that is refused before the fix, and the generated client throws on a non-2xx
and drops the response with it.

## Why both cases are on one runner

The same wrong order appears in two places, and each rejects an ordinary
request: creating a record without the column, and adding the column to a table
that already has rows. Two fixes, two commits, one shape.
