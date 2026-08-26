# field/y235-button-rename-keeps-click-counts

**T6262** — fixed.

## What the user sees

A button column counts how many times each row's button has been pressed, and
the column's own settings cap that count. Renaming the button, recolouring it,
raising the cap or adding a confirmation dialog looks like presentation — the
sort of edit made while tidying a base up.

Every row's count went back to nothing. Where the cap exists to stop a button
being pressed twice, every row becomes pressable again at once, and the record
of who already ran it is gone.

## Why

Those settings were classified as changes to what the column holds, so the edit
rewrote the column's data along with its definition.

## What the checkpoint asserts

Every row still carries its count after the edit, read back over the API. Three
rows, so a partial wipe is visible as one.

## What the fixture has to hold

The counts are seeded with SQL, before the checkpoint. Pressing the button runs
the workflow behind it, which is a different subject with its own timing; what
this case is about is what an edit to the column's settings does to counts that
are already there.

The counts are read over the API before the edit as well. If they were not
visible there, "the counts are gone" afterwards would mean nothing. The seeded
count is not zero, for the same reason.
