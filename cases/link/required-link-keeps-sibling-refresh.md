# link/required-link-keeps-sibling-refresh

## Where the bug came from

T6861: a computed refresh wrote NULL into the display column of a required
manyOne link and dead-lettered. In production, a row's required-link foreign key
(`__fk_*`) was already empty while its display column still held the old JSON;
an update to the foreign table triggered a refresh of both link fields in one
step, and the generated SQL took its ELSE branch on the empty foreign key and
wrote NULL into the required display column. Postgres answered 23502 and the
task dead-lettered as `data_constraint` — **which the admin console refuses to
replay**, so every occurrence needed a human.

Fixed by [teable-ee 1fc507346](https://github.com/teableio/teable-ee/commit/1fc507346)
(PR #3088). The cause is that `UpdateFromSelectBuilder`'s COALESCE for a
required link only covered "foreign key present but the join missed", and
deliberately propagated NULL when the foreign key itself was empty.

## Two assertions, and which one fires depends on the environment

The checkpoint asserts two things at once:

1. the manyMany link picked up the new title;
2. the required link was not emptied.

The first exists because the production shape is the whole UPDATE failing
together (23502), so the manyMany link — which had nothing wrong with it — never
gets its new value either. That is what the user loses. The second exists
because an implementation that "succeeds" by blanking the required link is a
different bug, and should be red rather than quietly green.

On the pre-fix commit (d3bf3f4fb) the one that actually fires is **the second**:

```
the manyMany link refreshed but the required link was emptied: undefined
```

So in this e2e environment the refresh did not fail as a unit — it simply wiped
the required link's value. Same root cause (NULL propagated on the ELSE branch
when the foreign key is empty), different surface. Both assertions stay: the
production "the whole batch died" shape and this "the value was wiped" shape
should both count as reproduction.

## Fixture

```
Foreign table                  Host table
──────────────                 ─────────────────────────────────────
Name = "linked-title"    ←──   Required Link (manyOne, notNull, one-way)
Name = "other-title"     ←──   Many Links    (manyMany, one-way)
```

One host row: required link → linked, manyMany → [linked, other].

The manyMany link holds **two** rows rather than one: with a single row, "the
whole field failed to refresh" and "this one entry failed to refresh" are
indistinguishable.

The required link is created **before any row exists**: making a link required
is only accepted while nothing could already violate it.

### Why the database is written

"Foreign key gone, display column still populated" is **wreckage**, not a state
the product will produce on request — it is what some earlier write path left
behind. No API produces it, so `framework/fixture-db.ts` clears that column
directly.

The foreign-key column is found **by pattern** (`__fk\_%`) rather than by a
hard-coded name: `__fk_<fieldId>` is an internal naming detail, and hard-coding
it would make the case start failing one day for a reason with nothing to do
with this bug.

Everything observed is public API: the user's row, read the way the grid reads
it.

## Phases and the verdict boundary

**Setup (failure = 💥 error).** Build the tables, both link fields and the row;
read once and assert v2 answered (`x-teable-v2-feature=getRecords`), the
required link is in place, and the manyMany link holds exactly two entries. Then
clear the foreign key and assert exactly 1 row was touched. All of this sits
outside the checkpoint — a fixture that did not come up should be judged 💥, not
mistaken for the bug.

**Checkpoint `sibling-link-refresh-survives-cleared-fk` (failure = ❌ bug
reproduced).** Rename the `other` row in the foreign table to trigger the
recompute, then poll the host row until the `other` entry in the manyMany link
carries the new title. A timeout counts as reproduction, because the write
answers 200 and the failure happens inside the computed pipeline — the only
signal on the user's side is that the value never arrives.

The 30s timeout is the assertion itself: too short and a slow-but-working
pipeline reads as the bug.

## Expected status

`status: fixed`. The fix is on develop (1fc507346); reproducing it again is a
regression.
