# field/legacy-field-id-table-still-works

**T6238** — fixed.

## What the user sees

A table that will not open. Not a row, not a column — the whole table, in a
base that worked before it was migrated.

## Why

Field ids only had their prefix enforced in v1, so ids that arrived through an
import or a migration can have a body that is not the sixteen characters this
version generates. v2 parsed them strictly.

A field id is part of every query built against the table it belongs to, which
is what makes this bigger than its sibling: `record/legacy-id-row-still-computes`
loses one row, this loses the table.

## How the case is built

An ordinary two-column table, then the second field's id is rewritten with SQL
to a legacy shape. The product cannot mint one — generation moved to the strict
format long ago — so this is what an old field looks like rather than what a
new one can be made into. The shape is checked first: the `fld` prefix v1 did
enforce, and a body length this version would never generate.

Renaming the id means moving the view's own record of that column too. A
half-renamed field would be a broken table for a reason that has nothing to do
with parsing, and the case would be reporting on its own fixture.

## What the checkpoint asserts

Reading the table, and then writing to it while addressing the field by the
legacy id itself — which is what any client that read the table would send
back. Both, because a read that worked while writes were refused would leave
the table visible and frozen.
