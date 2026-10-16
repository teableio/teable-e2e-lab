# table/y2814-a-table-cannot-start-with-a-checkbox

**T7771** — fixed in `f17269a58`.

## What the user sees

An integration that builds tables from a spec and matches on the documented
error code does not recognise the refusal, so it cannot tell "fix your spec"
from "try again later".

Observed before the fix (`befc65538`): every request was already refused with
400 and the right message, but with the error code `validation_error` instead
of the public `VALIDATION_ERROR`. No table was created. This case is about the
error contract, not about data.

## What the checkpoint asserts

Each request is refused with 400, the error code `VALIDATION_ERROR` and a
message saying the type is not supported as a primary field, and no table is
left behind.

## What the fixture has to hold

One request per type, each with that type as the only column, and a
foreign table for the link to point at.
