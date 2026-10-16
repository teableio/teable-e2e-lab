# selection/y2730-an-editor-cannot-add-an-option-by-pasting

**T7822** — fixed in `5255dd724`.

## What the user sees

Pasting a column of text into a select adds every distinct value as a new
option, whether or not the person pasting may change the column.

## What the checkpoint asserts

After the editor pastes `X` into the select cell, the options are still
`A`, `B` and the cell does not hold `X`.

## What the fixture has to hold

The same second person and control write as the typecast case. The fix
shipped before this case was added; see CONTRIBUTING.md on permission
bugs.
