# selection/paste-across-pending-field

**T6759** — fixed. On the `paste-over-pending-field` runner; the shared design
is described in `selection/paste-by-id-across-pending-field`.

## This variant

The same leftover pending field, reached by the paste the grid itself sends:
a rectangular range addressed by column position, not a list of field ids.

The report came in on paste-by-id. The write path underneath is shared and the
fix landed in the selection service both requests go through, so the range
paste is expected to fail the same way — but expected is not measured, and this
case is what measures it. If it turns out green on the fix's parent, it does
not ship: a case green on both columns warns about nothing.

The pending field is the third column here, appended by the field creation,
rather than sitting in the middle as it does in the by-id variant. Column
position is how this request names its target, so the selection spans all three
columns and the pasted values are checked on the two that are real.
