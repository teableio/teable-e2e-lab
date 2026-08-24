# field/y225-clearing-a-checkbox-default-saves

**T5595** — fixed.

## What the user sees

A checkbox column defaults to ticked, somebody clears that, the editor says it
saved — and the next row still arrives ticked. Reopening the field shows the
default still there.

Measured on `73eb5290e`: the request answers **200** and the column keeps its
default. That is worse than a refusal, which is what this doc first assumed:
there is nothing to notice at the time, and the discovery comes later, from
rows that are wrong.

## Why

"No default" and "defaults to unticked" are different answers, and they are
said differently: the first is nothing where a value was, the second is
`false`. The field's schema accepted only `true` or `false`, so the first was
not something it could carry — and what did not survive validation simply did
not reach the field.

## What the checkpoint asserts

The request succeeds **and** the saved column no longer carries a default. A
request that answered 200 and kept the default would be the same column with a
friendlier error, and the next row created would still arrive ticked.

The column is confirmed to start with a default, outside the checkpoint —
clearing one that was never there would pass anywhere.

The request goes through raw axios with the status left open. That was written
expecting a refusal; the answer turned out to be a 200, and keeping the raw
response is what made the status visible in the artifact rather than assumed.
