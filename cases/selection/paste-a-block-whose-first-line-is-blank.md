# selection/paste-a-block-whose-first-line-is-blank

**T5268** — fixed.

## What the user sees

A paste where every value landed one row from where it belongs, and nothing
says so.

A blank first line is not a mistake. It is what a person copies when the top
row of their selection has nothing in that column: a spreadsheet block with an
empty first cell, or a column of values where the first entry has not been
decided yet. The blank means "empty this one", the same way every other value
in the block means "put this here".

Dropping it shifts everything up by a row. The paste answers with the right
number of rows touched, the values are the ones the person copied, and the row
that should have been emptied keeps its old value — which is the part that
survives the longest.

## What the checkpoint asserts

The row the blank line lands on comes back empty, and each later value is on
the row it was addressed to.

## What the fixture has to hold

Every row starts holding its own distinct value. A table that started empty
could not show a row keeping an old value where a blank should have landed.

At least two lines after the blank one, all different, or a shift of one row
would not be distinguishable.
