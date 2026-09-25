# table/trash-a-table-behind-a-borrowed-link

**T7539** — fixed. On the `trash-behind-a-lookup-of-link` runner.

## What the user sees

A table in use disappears from the sidebar. It is not in the trash either,
and nothing in the product brings it back. Its rows are all still there.

What happened is a failed delete. Somebody moved another table, the "far" one,
to the trash. That table was linked from a middle table, and a host table
borrowed the middle table's link column through its own link. Trashing the
far table turns the middle link into text, and the host's borrowed column has
to be refilled. It is a single value stored as JSON, it was refilled with
text, and the database refused. The delete failed half way, and the table it
was deleting was left in a state nothing lists.

## What the checkpoint asserts

- the delete answers 2xx;
- the far table shows up in the base's trash;
- the host's borrowed column still names the far row.

## Why the fixture is shaped this way

Both links are many-to-one. That is what makes the borrowed column a single
value rather than a list, and the single value is the shape that was refused.
Outside the checkpoint the case checks the borrowed column is a single value
naming the far row before anything is deleted, and that the delete was served
by v2.

## Evidence

Run 36121868574: on `b4908f0a4d` and `e14c3f4b10` (the fix's parent) the
delete answered 500 with `column "Borrowed_far" is of type jsonb but
expression is of type text`, the error in the customer's log; absent on
`402ba3520d` and `develop` (`37830698a4`).
