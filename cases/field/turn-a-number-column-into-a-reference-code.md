# field/turn-a-number-column-into-a-reference-code

**T6959** — fixed.

## What the user sees

A column that empties itself when they change how it is written.

This is how a plain counter becomes a reference someone can quote on the phone:
the case numbers were 1, 2, 3, and now they should read C-001, C-002, C-003.
The column keeps its place and its meaning; only the way it is written changes.

The change did not go through. The column's storage was made for numbers and
the new rule produces text, so the pass that fills the column in failed where
nobody could see it. The column sat empty, with nothing on screen explaining
why and no way to finish the job.

## What the checkpoint asserts

Every row reads as a reference code, and every row's code is its own.

## What the fixture has to hold

The numbers are in the column as written before the change. A column that was
already empty could not show a conversion that failed to fill it.

Two rows at least, so a column that filled in and a column that filled one row
stay distinguishable.

## Why the case waits

Filling a column in happens after the request answers. A case that read once
would call slow "empty", so it polls until every row has something or the
attempts run out.
