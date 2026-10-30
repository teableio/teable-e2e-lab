# attachment/a-cleared-attachment-cell-stops-counting

**sentinel/attachment-usage-cell-cleared** — sentinel.

## What the user sees

Someone removes the files from a cell to free up storage; the space's
attachment usage has to go down with them.

## What the checkpoint asserts

After the cell is cleared, the space's calibrated attachment usage is
exactly the size of the attachment in the other column.

## What the fixture has to hold

A space created for the run (and deleted afterwards) holding exactly two
attachments of different sizes, 4096 and 1000 bytes, with content unique to
the run so they never share a stored file. The space is calibrated once,
after the removal: a fresh space's first calibration computes from scratch,
and a cached answer stops the case as an error rather than a verdict. Both attachments sit in one row, one per attachment
column; the cell holding the larger one is cleared.
