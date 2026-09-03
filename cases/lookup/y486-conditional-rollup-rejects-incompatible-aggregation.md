# lookup/y486-conditional-rollup-rejects-incompatible-aggregation

**T7087** - fixed.

## What the user sees

The API accepts a conditional summary whose function cannot operate on the
selected source column, leaving a half-valid field in the table.

## What the checkpoint asserts

Button with `counta`, number with `and`, and checkbox with `sum` each return a
4xx response and none persists. A valid conditional number sum is created
first through the same public endpoint.
