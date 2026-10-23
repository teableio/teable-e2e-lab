# record/y3329-an-empty-update-is-refused

**T7941** — fixed in `a95864ca1`.

## What the user sees

An integration whose mapping filtered every field out sends an empty
update and gets a 500, reads it as an outage and retries — the run is logged
as a server failure instead of a mapping to fix.

## What the checkpoint asserts

The PATCH `{"record":{"fields":{}}}` is refused with 400 and the code
`validation_error`, and the row still holds its value.

## What the fixture has to hold

One row with a known value, so "unchanged" is checked against something.
