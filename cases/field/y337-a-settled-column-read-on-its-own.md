# field/y337-a-settled-column-read-on-its-own

**T6581** — fixed.

## What the user sees

A worked-out column that never stops looking busy.

The mark that says "this column is still being filled in" is what the interface
draws as a spinner. It is supposed to come off when the filling in finishes.
Asked for one column on its own, the product kept the mark on every worked-out
column forever; asked for the list of columns, it reported the same columns as
finished.

That is the shape that wastes an afternoon. The same column is busy in one
place on screen and done in another, the values are all there, and nothing the
person does moves it.

## What the checkpoint asserts

For each worked-out column, the answer to "read this one column" and the answer
to "list the columns" agree on whether it is still busy.

Agreement, not a fixed value: the case is not asserting that a column is
finished at that instant, it is asserting that the product does not say two
different things about the same column. That is the complaint.

## What the fixture has to hold

Three worked-out columns of the three kinds a person meets — one computed from
this table, one borrowed from another, one totalled over another — because the
bug did not distinguish between them and one kind is a thin fixture.

They have really settled before the case looks: the row carries a computed
value and the list no longer reports any of them busy. Until then "still busy"
is the truth, and a case that looked earlier would be reporting the product
being right.
