# user-field/group-keeps-legacy-id-out-of-empty

**T6626** — fixed. On the `user-group-identity` runner; the shared design is
described in `user-field/group-folds-drifted-snapshots`.

## This variant

A user cell whose whole value is the bare user id — the shape written before
user cells carried a snapshot at all, and still accepted by the public value
normalization today.

Reading the id and the title through object accessors produced NULL on those
cells, and NULL is what an empty cell produces too. So the person on the row
was grouped as nobody: the grid shows a row with an assignee sitting under the
"empty" header, next to the rows that genuinely have none.

The fixture is two empty rows and one legacy cell, and the assertion is that
the empty bucket holds exactly the two. One empty row would be enough to
observe the merge, but not enough to notice a fix that solved it by breaking
the empty bucket instead.
