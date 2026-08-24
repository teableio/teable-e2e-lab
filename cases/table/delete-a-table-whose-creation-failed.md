# table/delete-a-table-whose-creation-failed

**T5585** — fixed.

## What the user sees

A table that failed to finish being created sits in the sidebar. It cannot be
opened, and it cannot be deleted — the delete is refused. There is nothing the
user can do about it from the product; it takes someone with database access.

## Why

The marking that says "this table is broken" is what keeps the half-made thing
out of the way of everything expecting a working table. Delete went through the
same door: it looked for a working table, did not find one, and refused.

## What the checkpoint asserts

The delete is accepted, the table is gone from the base's list, **and** the
working table beside it is still there. A delete that answered successfully and
left the table listed is a different failure with the same appearance, and one
that took the neighbour too would be worse than the refusal.

## What the fixture has to hold

The broken marking is written with SQL, as setup before the checkpoint. Making
a table creation fail on purpose is not something the product offers, and
reproducing the failure would be testing the failure rather than the cleanup.
