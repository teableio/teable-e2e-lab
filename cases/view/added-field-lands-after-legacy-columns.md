# view/added-field-lands-after-legacy-columns

**T6595** — fixed.

## What the user sees

A column is added and does not appear where it was added — it turns up
somewhere in the middle of the table, or not visibly at all.

## Why

A view keeps its own record of where each column sits. Tables older than that
bookkeeping, or that lost entries along the way, have views listing only some
of their fields — and the fields with no entry are exactly the ones nobody has
ever moved, which is to say the ordinary ones.

Appending derived the new column's position from the entries that exist rather
than from the columns that exist. On a view holding one entry, a table with
four columns hands the new field position 1, which the second column already
occupies.

## How the case is built

Four columns, then the view's metadata is trimmed with SQL to mention only the
first. The product will not produce that state — every view it writes today
lists every field — and that is the point: this is the shape of a table older
than the current bookkeeping, not a state anyone can ask for.

At least two fields have to be missing their entry. With one, a new column
landing on top of it cannot be told apart from an ordering that is merely off
by one.

The assertion reads the fields through the view, which is the order the grid
draws. The positions the view ends up storing are recorded after the checkpoint
as diagnostic detail, so a read that throws is never mistaken for the bug.
