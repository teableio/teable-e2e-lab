# link/y554-picker-keeps-selection-across-tabs

**T7055** - fixed.

## What the user sees

A linked row is already saved. Switching the picker between All and Selected
can leave that row missing or visibly unchecked, even though the cell still
contains it.

## How the case is built

The API creates the foreign rows, the multi-link field, and a host row already
linked to Y3. The browser then opens that saved cell's picker, rapidly switches
the two tabs ten times, closes the picker, and repeats after reopening it.

## What the checkpoint asserts

After each rapid switching burst, Selected contains Y3 without stale
unselected rows and paints its row as selected; the final return to All paints
the same row as selected as well. The picker grid remains mounted while each
tab's request loads, and the same checks hold after reopening. The public API
is read afterwards to prove tab switching did not change the saved link.
