# view/a-new-column-stays-off-a-trimmed-form

**T7621** — fixed. On the `new-field-in-customized-view` runner.

## What the user sees

A form that hides some columns - the ones the people filling it in should not
see. Somebody adds a column to the table for internal use, from the grid. The
form now shows it, visible, as a new question. Nobody opens the form to check;
the people filling it in see the question first.

The rule the product had kept: a view that already hides a column keeps new
columns hidden; a view that hides nothing shows them.

## What the checkpoint asserts

After the new column is created, read back through the view list:

- the trimmed form has the new column hidden;
- the trimmed form still hides the column it hid before;
- the form that hides nothing shows the new column.

The third point is the other half of the rule. Hiding every new column on every
form would pass the first two and fail it.

## Why the fixture is shaped this way

Two forms on the same table, one trimmed by hiding a single column and one left
alone, plus a grid. The new column is created from the table without naming a
view, the ordinary way, so neither form is the view it was created from - the
view a column is created from keeps its own default.

Outside the checkpoint the case checks the trimmed form really hides its column
and the full form does not, and that the column was created by v2.

## Evidence

Run 36120798558: reproduced on every column up to `292b76bfff` (the fix's parent) - the new column landed on the trimmed form as `{"order":2,"visible":true}` - and absent on `develop` (`37830698a4`).
