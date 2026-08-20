# lookup/null-multiplicity-scalar-converts

**Bug:** T6786 — `Failed to update table schema: error: invalid input syntax
for type json`, hit while trying to repair a table whose computed fields were
already dead-lettering.

## What broke

This is the second half of the same report as
`lookup/null-multiplicity-scalar-refreshes`, and the half that turned an outage
into a dead end.

With the lookup's computed updates failing permanently, the obvious way out
from inside the product is to stop it being a lookup: convert it into a plain
text field, keep the values, move on. The customer tried exactly that.

The conversion read the same NULL `is_multiple_cell_value` and made the same
assumption — the cell is multi-valued, so its stored form must be JSON — and
ran `jsonb_typeof` over a column of plain text. Postgres answered `invalid
input syntax for type json`.

So the table could not compute, and could not be repaired either. No sequence
of user actions led anywhere; the state was only reachable by an operator
touching the database.

## Reproduction

Same fixture as the sibling case:

1. `foreign(text) ← host(link, lookup of that text)`, seeded and resolved.
2. Bring the physical lookup column down to scalar `text` and set
   `is_multiple_cell_value = NULL`.
3. `PUT /table/{tableId}/field/{fieldId}/convert` with
   `{ type: "singleLineText" }`.

Before the fix, step 3 fails. After it, the field converts and stops being a
lookup.

## What the checkpoint asserts

That the convert answered 2xx, and that the field really is a plain
`singleLineText` afterwards rather than still a lookup. Both, because a
conversion that reports success while leaving the field as it was is the same
dead end with a better status code.

The convert goes out through raw `axios` with `validateStatus` open — the
generated client raises `HttpError` on non-2xx and drops the response with its
routing headers, and pre-fix this request is exactly a non-2xx.

The engine assertion sits **inside** the checkpoint here, unlike every other
case in this repo. The request under test is also the observation, so there is
no earlier response to assert on. Placing it inside means a non-v2 answer
throws as a reproduction rather than an error — the conservative direction: it
can read as "the bug is present" when the harness is misconfigured, but never
as "the bug is gone".

## Why the data looks like this

The fixture is identical to the sibling case, deliberately. Two cases over one
state is what lets the comparison table say which half of the report came back
— the table computing again, or the table being repairable — rather than
collapsing both into one row that only says "T6786".

`sourceValue` and `sourceValueAfter` are unused by this observation, but the
runner still refuses them being equal, so the sibling case cannot accidentally
be built on an edit that queues nothing.
