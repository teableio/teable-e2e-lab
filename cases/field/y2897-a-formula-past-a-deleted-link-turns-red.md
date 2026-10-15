# field/y2897-a-formula-past-a-deleted-link-turns-red

**T7742** — fixed in `48918669e`.

## What the user sees

After a link column is deleted, the looked-up price and the total turn
red, while a formula built on the total stays an ordinary-looking empty
column — the shape of "no orders yet" rather than "this stopped working".

## What the checkpoint asserts

The delete answers 2xx from v2, and the lookup, the rollup and the formula
over the rollup all report `hasError: true`.

## What the fixture has to hold

Two linked products, so the total is a sum rather than a copy of one price,
and the whole chain is checked to hold the expected values before the delete:
a chain that was already empty cannot show what the delete broke.
