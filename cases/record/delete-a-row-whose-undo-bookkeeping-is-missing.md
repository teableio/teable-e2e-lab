# record/delete-a-row-whose-undo-bookkeeping-is-missing

**T6928** — fixed.

## What the user sees

A row that will not delete. They select it, delete it, and it is still there.
They try again and it is still there.

Deleting a row also records what was in it, so the delete can be undone. When
that recording could not be made, the delete was undone as well. Nothing on
screen mentions undo, so there is nothing to connect the refusal to and no way
to get rid of the row.

Whether the recording is in place is not something a person can see or control,
which is why "the recording failed" is not an answer they can act on. Losing
the ability to undo is a smaller loss than losing the ability to delete.

## What the checkpoint asserts

The deleted row is gone, and the row that was not deleted is still there.

The second half matters: a delete that took the whole table and a delete that
took the right row otherwise give the same answer.

## What the fixture has to hold

The undo bookkeeping is there before it is turned off — the case checks the
trigger by name on the physical table. If it were named something else, or
absent everywhere, turning it off would be a no-op and the case would be
watching an ordinary delete.

It is turned off with SQL: no request produces a table without it, and a table
that has always had it cannot show the difference.
