# user-field/group-keeps-unwrapped-cell-out-of-empty

**T6626** — fixed. On the `user-group-identity` runner; the shared design is
described in `user-field/group-folds-drifted-snapshots`.

## This variant

The same loss, reached by a change anyone can make from the field editor.
Switching a user field from single to multiple does not rewrite the cells that
are already there: they keep holding one object where the column now expects a
one-element array.

The identity expression mapped any non-array cell in a multi-value column to
NULL, so every row written before the switch joined the empty group while rows
written after it grouped normally — the same field, the same person, two
different answers depending on which side of the conversion the row was
written.

The fixture carries all three: an empty row, a row written the current way, and
a row left unwrapped. The unwrapped row has to end up with the current-way row,
not merely out of the empty bucket — a fix that gave it its own third bucket
would still be showing one collaborator twice.
