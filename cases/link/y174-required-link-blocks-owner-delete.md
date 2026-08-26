# link/y174-required-link-blocks-owner-delete

**Bug:** T6705 — required manyOne/oneOne writeback dead-letters when the foreign
row is gone.

## What broke

Deleting the row a required link points at was allowed. The foreign key was
`ON DELETE SET NULL`, so the owner row went and a v2 computed seed task was
queued to rebuild the host table's link display cache. The join now missed, the
generated `UPDATE` wrote NULL into a display column that is `NOT NULL`, and
Postgres raised 23502 — `failureKind=data_constraint`, `phase=execute_plan`,
dead-lettered on the first attempt, because a constraint violation is not worth
retrying.

The source write had already committed. So the base was left holding a state
the product itself calls invalid — a required link with nothing on the other
end — and the host table's compute panel showed the raw Postgres error. The
admin dead-letter page was the only way back.

"Required" only means something if the write that would break it is the write
that fails. The fix makes the FK `ON DELETE RESTRICT` on the hosting side,
refuses the delete up front when a required host link still points at the row,
and maps a DB-level 23503 to a 400 rather than a 500.

## Reproduction

All public API:

1. Create an owner table with one row.
2. Create a host table, add a `manyOne` link to the owner table with
   `notNull: true` (before any host row exists — a link can only be made
   required while nothing violates it), and create one host row pointing at the
   owner row.
3. `DELETE /table/{ownerTableId}/record/{ownerRecordId}`.

Before the fix the delete answers 2xx and the owner row is gone. After it, the
delete answers 4xx and both rows are untouched.

## What the checkpoint asserts

That the delete answered a **4xx**, that the owner row is still readable, and
that the host row's required link still points at it. The range rather than an
exact code: a 2xx is the original bug, and a 5xx would mean the rule is upheld
only by the database blowing up under the request — not a refusal the caller
can act on.

Nothing here waits. The dead-lettering downstream is asynchronous, but the
delete answering 200 is not, and that is the sharp edge of the bug: the case
observes the moment the invalid state becomes reachable, not the wreckage that
follows.

The delete goes out through raw `axios` with `validateStatus` open, because the
generated client raises `HttpError` on non-2xx and drops the response — and
with it the routing headers. This case turns on a request that is _supposed_ to
fail, so that is the only way to prove v2 served the very call under test
rather than a second, more convenient one.

## Why the data looks like this

One owner row and one host row. Neither title is asserted on — what carries the
case is that the link resolves before the delete and still resolves after the
refusal.

The link is `isOneWay: true`: a symmetric field would add a second physical
structure to the same fixture without adding anything the assertion reads.
`manyOne` is the FK-hosting side, which is where the fix derives
`ON DELETE RESTRICT`; the non-hosting side of a two-way link deliberately keeps
`SET NULL`, so pointing this case at it would be asserting the opposite of the
intended behavior.
