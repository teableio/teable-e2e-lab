# selection/paste-across-pending-field

**T6759** — fixed. On the `paste-over-pending-field` runner; the shared design
is described in `selection/paste-by-id-across-pending-field`.

## This variant

The same leftover pending field, reached by the paste the grid itself sends:
a rectangular range addressed by column position, not a list of field ids.

The report came in on paste-by-id. The write path underneath is shared and the
fix landed in the selection service both requests go through, so the range
paste was expected to fail the same way — and it does. Measured on
`87ff8a8c3`, run 32649325772: the same 500, the same Postgres complaint that
the column does not exist. So the failure was never specific to the endpoint
the report happened to come in on; anyone pasting over that column in that base
was hitting it, by whichever route.

The pending field is the third column here, appended by the field creation,
rather than sitting in the middle as it does in the by-id variant. Column
position is how this request names its target, so the selection spans all three
columns and the pasted values are checked on the two that are real.
