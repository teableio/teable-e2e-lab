# field/clearing-a-checkbox-default-saves

**T5595** — fixed.

## What the user sees

A checkbox column defaults to ticked, somebody decides it should not, and the
field editor will not save the change. The way out is to delete the column and
build it again — which takes the data with it.

## Why

"No default" and "defaults to unticked" are different answers, and they are
said differently: the first is nothing where a value was, the second is
`false`. The field's schema accepted only `true` or `false`, so the first was
rejected outright.

## What the checkpoint asserts

The request succeeds **and** the saved column no longer carries a default. A
request that answered 200 and kept the default would be the same column with a
friendlier error, and the next row created would still arrive ticked.

The column is confirmed to start with a default, outside the checkpoint —
clearing one that was never there would pass anywhere.

The request goes through raw axios with the status left open: it is the request
that is refused before the fix, and the generated client throws on a non-2xx
and drops the response with it.
