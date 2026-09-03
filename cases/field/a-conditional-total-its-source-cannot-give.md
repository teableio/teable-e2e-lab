# field/a-conditional-total-its-source-cannot-give

**T7087** — fixed. On the `rollup-create-compatibility` runner.

## What the user sees

The same thing `field/a-total-its-source-cannot-give` describes, one column type
over. A conditional total — one that picks its rows by matching rather than by
following a link — was created through the API with a button as its source and a
count as its function. The API answered 201. The column showed `0.00` on every
row of the table, and reopening its settings showed no source field at all,
with nothing offered to replace it.

## Why

A conditional total resolves its source differently from an ordinary one, and
has its own create handling. The validation that covers ordinary totals did not
reach it.

## What the checkpoint asserts

Identical to the sibling case: each incompatible combination is refused with a
4xx **and** leaves no column behind, while a legal conditional total built from
the same pieces is accepted outside the checkpoint.

The condition is a real one — the source table's match key compared against the
host row's — because a conditional total with no condition is a different code
path, and the report is about the one with a condition.

## Why the two cases are separate

They were fixed by two commits two days apart, in two places. Reading one green
column as covering the other is exactly the mistake the split prevents.
