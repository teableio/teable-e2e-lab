# field/a-total-its-source-cannot-give

**T7046** — fixed. On the `rollup-create-compatibility` runner.

## What the user sees

A totalling column is created through the API asking for something its source
cannot give: the sum of a tickbox, all-of on a number, a count over a button.
The request is accepted. What lands is a column that reads `0.00` on every row
and whose settings open with an empty source box and nothing selectable in it —
it cannot be corrected, only deleted and rebuilt.

The field editor never offers these combinations; it knows which functions each
column type supports. So this is reached by whatever writes fields without the
editor: an automation, an integration, a script.

## Why

The support matrix lived in the editor. The create endpoint took the field's
type, its source, and its function on trust, and only found out later — at
computation time — that the three did not go together. By then the row was
written.

## What the checkpoint asserts

Two things, and both are needed:

- the request is refused with a 4xx, and
- the column is not in the table afterwards.

A 4xx that still wrote the row would leave exactly the unusable column the
report is about, so a status check on its own would pass over the bug.

Outside the checkpoint, a **legal** total is created out of the same tables and
the same source column, and must be accepted. That rules out the reading which
would make this case worthless: an endpoint refusing every total would answer
4xx to the checkpoint too and look like the fix.

The requests go through raw axios with the status left open — the generated
client throws on a non-2xx and drops the response, routing headers and all.

The engine is asserted on the setup field create, which is the same endpoint and
the same `createField` feature the checkpoint uses, so a v1 answer is an error
rather than a green column.

## The sibling next to it

`field/a-conditional-total-its-source-cannot-give` (T7087) is the same missing
check on the conditional column type, fixed separately a day later. Same runner,
`column: "conditionalRollup"`.
