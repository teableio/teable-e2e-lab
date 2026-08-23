# record/repeated-delete-is-idempotent

**T6586** — fixed. On the `delete-collateral` runner; its sibling is
`field/delete-spares-a-field-sharing-its-column`.

## What the user sees

A delete that already worked, reported as a failure the second time it is
asked for.

Deleting is the operation a client retries most readily: the response is
dropped and the request is sent again, a button is double-clicked, a sync job
replays its queue after a restart. Every one of those arrives as a delete of
records that are already gone, and answering an error turns a completed
operation into an apparent problem — one that stays in the caller's error log
and, for an integration, can stall a queue that treats the failure as
unfinished work.

## How the case is built

Three rows, deleted, then deleted again with the same ids.

The rows are read back between the two deletes, outside the checkpoint: if any
survived the first delete, the second would be the one that lands rather than a
repeat, and the case would be measuring an ordinary delete.

The second delete goes through raw axios with the status left open. The
generated client throws on a non-2xx and drops the response with it, and this
is the request that is refused before the fix — the status and the body are the
evidence.

Both deletes' routing headers are recorded rather than asserted: the record
delete controller carries no v2 feature tag, so there is nothing to assert
against. What proves the path is the red column on the fix's parent.
