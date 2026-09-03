# lookup/y159-user-snapshot-date-sort-spans-group

## Where the bug came from

T6751, reported as "sorting is scrambled when grouped": grouped by person and
sorted by payment date descending, the dates inside one person's group ran
**2026, 2025, 2026**.

The group header folds **several stored snapshots** of the same collaborator
into one bucket, keyed on id and title, but the generated SQL still ordered by
the **raw JSON**. A collaborator's snapshot carries email and avatarUrl
alongside id and title, and those drift over a base's lifetime — every row keeps
whatever the snapshot looked like the last time it was computed. So "sort by
date descending" was really "sort by snapshot JSON, then by date within each
snapshot", and one visually single group contained two separately descending
runs of dates.

## Why the fixture is written to the database

Snapshot drift is not a state any API produces: it is what accumulates after a
collaborator changes their avatar or email while old rows keep the old
snapshot. Reproducing it through the API alone would mean mutating a real user
account mid-case — slower, and it would leave the seed user changed for every
case that runs afterwards.

So this case injects the drift with `framework/fixture-db.ts`. The rule lives in
that file; in short: **the database is for building fixtures, the observation
always goes through the public API**. It is enforced rather than trusted —
asking for a database handle inside `bugCheckpoint()` throws, and a setup-phase
throw is 💥 (the case could not run), never mistaken for the bug.

The reasoning is simple: what a user reports is always something the API did (a
500, a wrong row order, a value that came back missing). A case that both writes
and reads the database proves something about SQL, not about the product.

## Fixture

```
Source table                 Host table
──────────────               ─────────────────────────────
Order (text)          ←──    Order (link, manyOne)
Owner (user, single)  ←──    Owner Lookup (lookup)
                             Name (text)
                             Payment Date (date)
```

The source table holds `older-orders` and `newer-orders`, both owned by the same
seeded user. The host table holds 5 rows: 3 linked to older, 2 to newer.

Then two snapshots are written directly into the host table's lookup column —
**identical id and title**, differing only in the extras:

| group        | snapshot extras                      | rows                      |
| ------------ | ------------------------------------ | ------------------------- |
| older-orders | `email: a@example.com`               | 2025-07, 2025-04, 2024-11 |
| newer-orders | `email: z@example.com` + `avatarUrl` | 2026-02, 2026-01          |

Identical id and title is the crux: that is the identity the group folds on.
Change it and they are genuinely two different people, and the question does not
arise.

**The dates must interleave across the groups.** The older group is all
2024–2025 and the newer group all 2026, so the correct overall descending order
is `2026-02, 2026-01, 2025-07, 2025-04, 2024-11`, while "descending within each
snapshot" is `2025-07, 2025-04, 2024-11, 2026-02, 2026-01`. The two differ,
which is what gives the case its discriminating power. The runner computes and
checks that property before creating anything, and refuses to run a fixture
where it does not hold.

Rows are inserted group by group, oldest dates first, so insertion order is the
exact opposite of the required result: an implementation quietly falling back to
row order cannot pass by accident.

## Phases and the verdict boundary

**Fixture verification (failure = 💥 error).** After injecting the drift, read
grouped by the lookup once and assert two things: all 5 rows come back, and
there is **exactly one group header**. If the drift had split the group, "do the
dates run straight down inside the group" is a question about something that no
longer exists.

**Routing check (failure = 💥 error).** Assert on that same grouped read that
`x-teable-v2=true` and `x-teable-v2-feature=getRecords` — the very read whose
ORDER BY the bug builds. v1 is still present and still answers; without this, a
run that quietly fell back to it would produce one meaningless green row. That
is not hypothetical; see `framework/engine.ts`.

**Checkpoint `date-sort-spans-the-whole-group` (failure = ❌ bug reproduced).**
Read grouped by the lookup and sorted by date descending, and assert the order
is exactly the overall descending one. When it is wrong, the error additionally
reports whether the order matches "descending within each snapshot", which
separates this bug from other sorting faults.

## Expected status

`status: fixed`. The fix is on develop (89477a9bd); reproducing it again is a
regression.
