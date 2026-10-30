# attachment/y3570-a-leftover-attachment-reference-stops-counting

**T8149** — fixed in `ef3dc7b39`.

## What the user sees

A space whose attachment fields were deleted long ago still shows their files
in its attachment usage, and emptying the trash does not bring it down: the
reference rows outlived the fields, and usage summed every row.

## What the checkpoint asserts

After the leftover reference is in place and the other attachment's field is
deleted but still in the trash, the space's calibrated attachment usage is
exactly the size of the attachment in the restorable field. Before the fix it
also counted the leftover reference.

## What the fixture has to hold

A space created for the run (and deleted afterwards) holding exactly two
attachments of different sizes, 4096 and 1000 bytes, with content unique to
the run, one per attachment column in the same row. The 4096-byte column is
deleted and the table's trash emptied; its reference row is then put back
with the database (setup only), the state older versions left behind. The
1000-byte column is deleted and left in the trash. The space is calibrated
once, after all of that: a cached answer stops the case as an error.
