# record/delete-a-row-with-a-broken-link

**T5469** — fixed.

## What the user sees

A table nobody can remove anything from. Not the broken column — the rows.
Deleting from the grid, through the API and in bulk all fail the same way, and
the message names a table id the user has never seen, because the table it
belonged to is gone.

This is the state a base is left in when a linked table is removed while
something still points at it.

## Why

Deleting a row clears that row out of every link it takes part in, and the
clearing is addressed to the table on the other end. With that table missing,
the clearing fails and takes the delete with it.

## What the checkpoint asserts

The row is gone **and** the other two rows are still there. A delete that took
more than it was asked for would be worse than one that refused.

## What the fixture has to hold

The broken state is written directly into the product's own bookkeeping — the
column is marked as one it knows has an error, pointing at a table id that does
not exist. That is setup, before the checkpoint: the sequence that produces the
state naturally is a repair job's business rather than a request anyone makes.

Three rows, so "one row was deleted" and "the table was emptied" are different
results.
