# link/delete-a-link-whose-table-is-gone

**T6539** — fixed.

## What the user sees

A column links to a table that is no longer there. Deleting the column fails.
It cannot be removed, and the error says nothing about the other table — so
there is nothing in the message to act on. The column stays.

## Why

Removing a link column also cleans up the other end of the relationship, and
that cleanup is a statement addressed to the foreign table's storage. With the
storage gone, the statement fails and takes the whole delete with it.

## What the checkpoint asserts

Two things. The link column is off the table afterwards — a delete that
answered successfully and left the column would be a different failure with the
same appearance. And the plain column beside it is still there: a delete that
cleared more than it was asked to would be worse than one that refused.

## What the fixture has to hold

The state is real but no request produces it: the table's metadata is
soft-deleted while its storage is gone. The case trashes the foreign table
through the API and then drops its physical table with SQL, which is setup and
happens before the checkpoint.

The runner checks the link column is still on the host before deleting it.
Deleting a column that has already gone would pass on any commit.
