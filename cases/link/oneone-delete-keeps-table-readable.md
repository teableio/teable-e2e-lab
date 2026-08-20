# link/oneone-delete-keeps-table-readable

**Bug:** T6807 — `GET /api/comment/:tableId/count` answered
`42703: column t_tbl….__id does not exist`. Fixed by
[teable-ee#3040](https://github.com/teableio/teable-ee/pull/3040)
(`2138a8f7fd`, 2026-08-18).

## What broke

A two-way `oneOne` link stores its foreign key on one table only — the one the
link was created from. The other side, the symmetric field, owns no physical
column, and resolved its foreign key name to `__id`: the record id column of
the table that does host the key.

Its schema rules were generated against that name anyway. Creating the link
added a self-referencing foreign key and a unique index on `__id`, and deleting
the link ran the mirror of that — it dropped `__id` itself.

Nothing about the delete reported a failure. The table simply stopped being
readable: every record query selects `__id`, so the next read was a Postgres 42703. Sentry caught it on the comment-count endpoint (BACKEND-AI-1F8), but the
endpoint is incidental — as far as any read was concerned the whole table was
gone, and no product action gets the column back.

## Reproduction

All public API:

1. Create a host table and a foreign table, one row each.
2. Create a `oneOne` link field on the host table with `isOneWay: false`, and
   read `symmetricFieldId` and `fkHostTableName` off the response.
3. Delete the **symmetric** field — the one on the foreign table.
4. `GET /table/{tableId}/record` on both tables.

Before the fix, step 4 answers 500 on the host table (the FK host, whose `__id`
was dropped). After it, both tables read back their seeded row.

## What the checkpoint asserts

The delete and both reads are inside the checkpoint together: "deleting a link
field breaks the table" is one event, and a delete that fails outright is as
much this bug as a delete that quietly takes `__id` with it.

Outside the checkpoint, as fixture verification: the two-way link produced a
symmetric field at all, `fkHostTableName` really is the host table (the premise
the case rests on — the symmetric side is the one with nothing of its own to
drop), the host row reads back before anything is deleted, and `getRecords` was
served by v2.

## Why the data looks like this

Nothing asserts on cell contents, so the rows carry plain titles and exist only
so a read that returns the wrong table is visible in the artifact. What matters
is the link's shape: `oneOne` (the relationship whose non-hosting side has no
column of its own) and `isOneWay: false` (a one-way link has no second side,
which is where the bug lives).

`deletedSide` is in the config rather than hardcoded so the choice is stated:
`"hosting"` deletes the side that legitimately owns the foreign key, which was
always correct and would not reproduce.
