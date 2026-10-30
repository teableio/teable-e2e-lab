# attachment/y3569-a-deleted-attachment-field-stops-counting

**T8166** — fixed in `b0e31cd28`.

## What the user sees

Someone deletes an attachment column and empties the trash to free up
storage; the space's attachment usage does not go down.

## What the checkpoint asserts

After the field is deleted and the table's trash emptied, the space's
calibrated attachment usage is exactly the size of the attachment in the
other field. Before the fix it also counted the deleted field's file.

## What the fixture has to hold

A space created for the run (and deleted afterwards) holding exactly two
attachments of different sizes, 4096 and 1000 bytes, with content unique to
the run so they never share a stored file. The space is calibrated once,
after the removal: a fresh space's first calibration computes from scratch,
and a cached answer stops the case as an error rather than a verdict. Both attachments sit in one row, one per attachment
column; the column holding the larger one is deleted.
