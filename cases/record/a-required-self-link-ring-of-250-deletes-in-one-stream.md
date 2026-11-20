# record/a-required-self-link-ring-of-250-deletes-in-one-stream

Sentinel for **T8613**, guarding the batched streamed delete added in `5150387a6`. The revision before it deleted everything in one step and passes here too.

## What the user sees

Selecting every row of a table whose rows point at each other through a required link and deleting them would stop part way if a delete batch split the ring.

## What the checkpoint asserts

A streamed delete (`PATCH /api/table/:tableId/selection/delete-by-id-stream`), selecting all records, reports no errors and 250 deleted rows, and the table is empty afterwards.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with 250 rows. A required many-to-one link to the same table points each row at the next and the last row at the first. The ring is longer than one delete batch, so a delete that splits it leaves a surviving row pointing at a deleted one.
