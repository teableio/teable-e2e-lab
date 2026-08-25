# link/a-link-to-a-row-with-no-name-yet

**T6509** — fixed.

## What the user sees

A link cell that can no longer be edited. Whatever the person does with it, the
save comes back refused — and what they are sending back is the value the
product just gave them.

The setup is ordinary. A row is allowed to have no name yet: it exists, other
rows already point at it, and the name column is the thing that gets filled in
last. Saving a link cell that already holds that link — which the interface
does whenever a cell is confirmed without being changed — stored "the name is
nothing" into the cell rather than storing no name at all.

A row with no name yet is not a row whose name is nothing. The first is a
normal row; the second is a value the product will not take back.

## What the checkpoint asserts

1. After the cell is saved a second time, the link to the unnamed row does not
   carry an empty name.
2. Writing the cell back exactly as it was read is accepted.

The second is the part that has to be measured rather than reasoned about,
which is why the case sends back exactly what it read rather than a value it
built.

## What the fixture has to hold

The cell points at both target rows before anything is written a second time,
and the unnamed row is really unnamed — otherwise the case is about a row that
simply has a name.

A named row alongside the unnamed one, so "the name was dropped for the unnamed
row" stays distinguishable from "the name was dropped for every row".
