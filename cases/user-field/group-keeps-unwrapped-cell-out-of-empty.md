# user-field/group-keeps-unwrapped-cell-out-of-empty

**T6626** — fixed. On the `user-group-identity` runner; the shared design is
described in `user-field/group-folds-drifted-snapshots`.

## This variant

The same loss, reached by a change anyone can make from the field editor.
Switching a user field from single to multiple does not rewrite the cells that
are already there: they keep holding one object where the column now expects a
one-element array.

The identity expression mapped any non-array cell in a multi-value column to
NULL, so rows written before the switch and rows written after it stopped
grouping as the same person — the same field, the same collaborator, two
different answers depending on which side of the conversion a row was written.
Where the leftover rows then land is measured below rather than assumed.

The fixture carries all three: an empty row, a row written the current way, and
a row left unwrapped. The unwrapped row has to end up with the current-way row,
not merely out of the empty bucket — a grouping that gives it its own third
bucket is still showing one collaborator twice.

## What the pre-fix column actually returns

Three buckets, one row each — `[["unassigned"], ["written-after-the-switch"],
["left-unwrapped"]]`, measured on `fb4d62c3c`, run 32586254919. So on this
fixture the unwrapped cell was not swept into the empty group; it was split off
into a bucket of its own, which is the "one collaborator, two headers" symptom
reached by a second route. The assertion catches both, because it names which
rows belong together rather than which bucket they must avoid.
