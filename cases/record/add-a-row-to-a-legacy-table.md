# record/add-a-row-to-a-legacy-table

**T6146** — fixed.

## What the user sees

A table that nothing can be added to. Every attempt to create a row fails — in
the grid, through the API, through an import. The message is a database error
about a column, and it names a column the user never filled in.

Which tables this happens on is invisible from the product: the "created by"
column looks the same either way. Only tables carried over from the previous
version have storage where the database owns that column.

## Why

The product writes the author into the "created by" column on every insert.
Where the database owns the column, Postgres refuses that write and rejects the
whole insert with it.

## What the checkpoint asserts

The row is created **and** it holds the value that was sent. A build that
accepted the insert by dropping the caller's own cells would be a different
failure with the same appearance.

## What the fixture has to hold

The storage is made with SQL as setup, before the checkpoint: the product does
not produce it any more. The column is generated from the row id, because what
the value is does not matter — that the database owns it does.
