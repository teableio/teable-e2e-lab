# field/delete-spares-a-field-sharing-its-column

**T6619** — fixed. The lead case of two on the `delete-collateral` runner; the
sibling is `record/repeated-delete-is-idempotent`.

## What the user sees

Two ordinary-looking columns. Deleting one of them empties the other, and the
data is not in the trash — it is gone, because the column that held it was
dropped.

## Why

Two live fields can end up mapped to the same physical column. A
de-duplication race during concurrent field duplication produces it, and v2's
`ADD COLUMN IF NOT EXISTS` hides the collision rather than failing on it: the
second field is created, its metadata names a column that already exists, and
everything looks normal.

It stays invisible until someone deletes either field. The delete drops the
column both of them name, so the survivor loses every value it held and its
metadata now points at a column that is not there. Nothing in the grid marks
which of the two is the dangerous one, because from the grid they are just
columns.

## How the case is built

Three fields — a title, a keeper, and a doomed one — and the fixture points the
doomed field's `db_field_name` at the keeper's column with SQL. There is no way
to ask the product for this state: it is the outcome of a race, and re-enacting
the race would be a test of timing rather than of the delete.

Before the checkpoint the keeper is read back through the shared column and has
to hold its values. Without that, "the keeper lost its data" could already be
true before anything was deleted.

The assertion is the keeper's values after the delete, not a status code. The
delete succeeds either way; what differs is whether the data is still there.

Whether the physical column survived is read after the checkpoint and recorded
in the artifact. It is diagnostic: a read that throws must not be mistaken for
the bug.

## Limits

The case covers deleting the field whose metadata was moved. The fix also
reserves names from live field rows so the collision stops being created in the
first place, which nothing here exercises — that is a race, and this repository
has no way to run one honestly.
