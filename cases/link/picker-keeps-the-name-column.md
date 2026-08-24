# link/picker-keeps-the-name-column

**T6335** — fixed.

## What the user sees

A link column can be told which columns of the table it points at to show while
choosing a record — an order picker that also shows the amount, a person picker
that also shows the team. Whoever sets it up ticks the extras and does not tick
the name, because the name is what a row is called, not an extra.

The name then disappears from the picker. Every row in the list is identified by
the extra column alone: two of the three rows in this fixture both read `42`,
and there is no way to tell which order is which. The link itself still works,
so nothing looks broken except the ability to choose.

## What the checkpoint asserts

Both directions, twice — on the picker's field list and on the rows it returns:

- the name column is there even though nobody ticked it;
- the third column, which nobody ticked either, is **not** there.

The second half matters as much as the first. The setting exists to bound what
the picker can read, so a picker that answered with every column would be a
worse fix than the bug.

## What the fixture has to hold

Three rows where two share the value of the shown column. A picker without
names is unusable in general, but with distinct values someone could argue it
still identifies the rows; with a repeat it plainly cannot.
