# record/add-a-row-to-a-table-that-joins-people-columns

**T7024** — fixed. On the `nested-user-array-join-create` runner.

## What the user sees

Adding a row to the table never finishes. The page spins and the gateway
eventually times out. Every attempt does the same thing. There is nothing else
to see — no error naming a column, no failed field, just a table that will not
take a row.

## Why

The table has several people columns and one formula meaning "everyone involved,
listed once, separated by commas": flatten the people columns into one list, drop
the empties, drop the repeats, join what is left. Four functions, each wrapping
the next.

Each of those layers re-stated the whole of the layer inside it. The statement
the database was asked to plan therefore grew a layer at a time; at seven people
columns it reached megabytes. Because the row is recomputed inside the write, the
write never returned.

## What the checkpoint asserts

The formula column can be **made**, the write returns at all, and the table then
lists the row.

Making the column is inside the checkpoint, not in setup, and that is not
tidiness. What grew a layer at a time is the statement, and planning it is what
fails — so it fails when the column is created as readily as when a row is
added. Measured: on the fix's parent the case never reaches the write, because
creating the column already answers

```
Unexpected unit of work error: Error: Client has encountered a connection error
and is not queryable
```

which is the message from the customer's own backend log. Built the other way
round, that failure lands in setup and scores as "this case could not run here"
— the one verdict that hides the bug.

The reported symptom is the write, and the write is still asserted. It is the
second half of the same defect rather than a different one.

The request carries its own time limit rather than being allowed to hang. A
request that never answers would run out the whole case and be scored as "this
case could not run here" — the one verdict that would hide the bug. Ending the
wait inside the checkpoint makes the silence the report.

The limit is deliberately generous. This is not a measurement of speed and does
not belong in the performance lab: the difference being asserted is between an
answer and no answer.

## Why the fixture is shaped this way

Seven people columns, because that is where the report was filed and because the
statement grew with the count — fewer columns may plan a large statement that
still completes, which would make the case green on both sides.

The borrowed column from a second table is part of the reported shape: it puts a
second computed column into the same write, which is what the customer's table
had.

The people columns are all filled with the same person. The growth is in
planning the statement, not in the data, so what the cells contain does not have
to be elaborate — but they are filled rather than empty so the formula has
something real to work on.
