# link/y571-fill-a-one-row-link-in-by-name

**T6950** — fixed.

## What the user sees

One row in the table shaped unlike all the others, and nothing on screen that
shows it.

Filling a link in by typing the other row's name — rather than picking it from
a list — is what every import does, and what a person does when they paste a
column of names. The product looks the name up and stores the row it found.

It stored the row inside a list, on a column that holds one row. The column
says it holds one, every row filled in by picking holds a plain value, and this
one holds a list of one. It surfaces later, in whatever reads the table
expecting the shape the column advertises.

## What the checkpoint asserts

The cell filled in by name comes back holding one row — the right row — rather
than a list.

## What the fixture has to hold

The column really is a "one row" column. Against a column that holds several, a
list would be the correct shape and the case would have nothing to ask.

A row filled in by picking the target directly, created first and outside the
checkpoint. It is what the two ways are compared against: without it the case
would be asserting a shape it decided on rather than the shape the same column
already uses.
