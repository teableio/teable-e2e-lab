# table/restore-brings-back-the-links-to-it

**T4324** — fixed.

## What the user sees

A table is deleted into the trash and taken back out. The table is there, its
rows are there — and the column on another table that pointed at it is not a
link any more, and the values looked up through it are gone.

Everything looks restored, which is what makes this expensive: the base is used
again on the assumption that the undo worked, and the missing connections are
found later, one report at a time.

## What the checkpoint asserts

Three things after the restore: the column is a link again, its cell holds the
same row it held before, and the value looked up through it reads the same. A
column that came back as a link but empty would be a different failure with the
same appearance.

## What the fixture has to hold

The connection is read before anything is deleted and has to be working —
restoring something that never worked would prove nothing.
