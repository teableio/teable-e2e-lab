# lookup/y340-a-borrowed-people-column-over-many-rows

**T6941** — fixed.

## What the user sees

A cell full of people that goes blank on the next refresh.

A column that borrows from a one-to-many link necessarily holds a list: one row
here reaches many rows there, so it borrows many values. The product describes
each column to whatever is drawing it, and that description is where "this one
holds a list" lives.

The description said it holds one. The grid drew a list of people as if it were
a single person, and the cell came up empty afterwards. The stored value was
there the whole time — only what was drawn was wrong, which is why nothing the
person does brings it back.

## What the checkpoint asserts

1. The product describes the borrowed column as holding several values.
2. The cell comes back as a list, with one entry per linked row.

Both, because a case that only read the cell would pass over a wrong
description — and the description is what the drawing follows.

## What the fixture has to hold

The host row really reaches every linked row before the borrowed column is
read. With one linked row, a single borrowed value would be the correct answer
and the case would be asserting the wrong thing.
