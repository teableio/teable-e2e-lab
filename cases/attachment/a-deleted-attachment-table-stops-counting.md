# attachment/a-deleted-attachment-table-stops-counting

**sentinel/attachment-usage-table-deleted** — sentinel.

## What the user sees

Someone deletes a table with files and empties the trash to free up
storage; the space's attachment usage has to go down.

## What the checkpoint asserts

After the table is deleted and the base's trash emptied, the space's
calibrated attachment usage is exactly the size of the attachment in the
other table.

## What the fixture has to hold

A space created for the run (and deleted afterwards) holding exactly two
attachments of different sizes, 4096 and 1000 bytes, with content unique to
the run so they never share a stored file. The space is calibrated once,
after the removal: a fresh space's first calibration computes from scratch,
and a cached answer stops the case as an error rather than a verdict. The attachments sit in two tables of the same base;
the table holding the larger one is deleted.
