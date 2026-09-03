# lookup/y470-ordinary-rollup-rejects-incompatible-aggregation

**T7046** - fixed.

## What the user sees

The API accepts a rollup function that cannot operate on its source column and
persists a broken field instead of rejecting the request.

## What the checkpoint asserts

Number with `and`, checkbox with `sum`, and button with `countall` each return
a 4xx response. None of the refused fields exists afterwards. A valid number
sum is created first through the same public endpoint to prove the fixture and
route are working.
