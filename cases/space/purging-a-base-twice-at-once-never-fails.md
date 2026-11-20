# space/purging-a-base-twice-at-once-never-fails

**T8647** — fixed in `405cc008f`.

## What the user sees

Emptying a base from the trash in two places at the same moment shows a server error in one of them.

## What the checkpoint asserts

Three `DELETE /api/trash/:trashId` requests for the same base, sent at once, answer with exactly one 200 and otherwise 409 or 404, never a server error. A retry afterwards answers 404, and a table in the other base of the space still opens.

Whether a revision with the bug loses the race on a given run depends on timing, so its column can read as passing. A server error is never acceptable on any revision.

## What the fixture has to hold

A space created for the run and deleted afterwards, holding two bases with three tables of 50 rows each. One base is moved to the trash in setup.
