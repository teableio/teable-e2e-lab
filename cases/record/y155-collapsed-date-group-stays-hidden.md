# record/y155-collapsed-date-group-stays-hidden

## Where the bug came from

T6856. A user grouped by a date field and collapsed one group; its records did
not disappear but were drawn **under the next group's header**, while the
neighbouring day's records went missing. The grouping itself was correct — the
header values and their order were right. Only the act of collapsing was wrong.

What triggers it is the **relative offset between two time zones**, not any
particular zone:

- the date field has its own display time zone (chosen in the field, and written
  as the browser's zone when a field is created or a sheet imported);
- the backend process has its own system time zone (the official image pins it
  to UTC).

Collapsing a group makes the backend build an "exclude this group" filter
condition, derived from the **group key**. The group key is an absolute instant
(that group's local midnight in the field's zone), but the derivation treated it
as wall-clock time and converted it again — shifting everything by the
difference between the two zones. When the field's offset exceeds the process's,
that shift crosses a day boundary and the exclusion lands on **the previous
day**: not one row of the collapsed group is excluded, and the previous day's
group is hidden instead.

So the case pairs the process zone (the lab pins UTC) with a field zone of
Asia/Shanghai, making the difference a constant 8 hours — the everyday setup of
any UTC deployment with UTC+8 users, not a constructed extreme.

## Phases and the verdict boundary

**Fixture verification (failure = 💥 error).** `framework/runners/group-buckets.ts`
first checks, as a pure function, that the bucket list itself holds up (below),
then the table is created, seeded, and read back.

**Setup (failure = 💥 error).** Create a two-column table (`Title` single line
text, `Day` a date field in the configured zone, formatted YYYY-MM-DD with no
time), seed the buckets' rows, then read once grouped by `Day` and prove:

- every seeded row comes back;
- the grouping is **exactly the declared buckets**, and every group header's
  value equals the instant in the config.

Keeping this outside the checkpoint matters: every conclusion below is "which
rows remain after collapsing a group", and if the product did not even bucket
the rows as expected, the question cannot be asked at all. That is a different
fault and should be judged 💥 rather than mistaken for this bug.

**Checkpoint `collapsed-group-excluded` (failure = ❌ bug reproduced).** Collapse
each group in turn, and for each one send a request to the endpoint the grid
actually loads rows from — `POST /table/{tableId}/record/socket/doc-ids`, with
`groupBy` and `collapsedGroupIds` — asserting the rows returned are **exactly**
the rows outside the collapsed group.

The collapse order runs **from the newest bucket backwards**, which is not
arbitrary: the misaimed exclusion lands on "the previous day", so collapsing the
newest bucket shows both directions at once — its own rows leak out and the
previous day's rows go missing. Starting from the oldest bucket, the first
failure would carry only the "leaked" half and the other half would never be
printed.

Asking the same question through the REST `GET /record` would give a false
signal: that path does not carry `collapsedGroupIds` at all and returns every
row whether or not the bug is present.

## Why the assertion compares title sets

Rows are identified by `Title`, not by index. Order within a group is not what
this case asserts; **which rows come back** is. So both sides are sorted and
compared whole, which answers both directions of the failure in one comparison:

| symptom                             | how it shows in the assertion                        |
| ----------------------------------- | ---------------------------------------------------- |
| the collapsed group's rows leak out | `leaked`: a title from the collapsed bucket appeared |
| the neighbouring day is hidden      | `hidden`: an expected title did not appear           |

The error prints all four — `leaked`, `hidden`, received, expected — so
diagnosing it does not require another run.

## Deterministic data

A row's value is a pure function of (bucket, local hour): the title is
`<local date>#<hh>h`, e.g. `2025-11-30#09h`. Every piece of evidence then
carries both the day and the time of day it belongs to, and reading the report
needs no second lookup table.

The bucket list has three load-bearing properties, guarded by
`framework/runners/group-buckets.test.js` rather than trusted by reading the
code:

1. **Every instant is local midnight in the field's zone.** Local midnight is
   what a day bucket is keyed on; an instant anywhere else and the product's
   group header would differ from the configured value, failing setup for a
   reason unrelated to this bug.
2. **Every bucket holds rows away from local midnight.** This one is the
   difference between a case that works and a case that only looks like it
   does. The first version of this case seeded every row at exactly its
   bucket's local midnight, and on the commit right before the fix it came back
   **green** — the same collapse that misfires for a user returned exactly the
   right rows. Spreading the rows across the day (00:00, 09:00, 23:00) makes
   the same commit reproduce, with the collapsed group leaking and its
   neighbour hidden. Why a midnight-only table escapes has not been pinned
   down; what is established, and re-run on both commits, is that it does. A
   fixture without a non-midnight row is therefore rejected outright rather
   than left to produce a matrix of meaningless greens.

3. **Adjacent buckets are adjacent local days.** The misaimed exclusion targets
   "the previous day", so only when the previous day is exactly the previous
   bucket (and non-empty) is the "rows that should have stayed were hidden" half
   observable at all; with a gap it lands on an empty day, silently.

The third property is checked by "one millisecond before local midnight belongs
to the previous day" rather than by subtracting 24 hours — across a DST
transition two adjacent local days can be 23 or 25 hours apart, and subtracting
24 hours would misjudge it. The test pins this with America/New_York
2025-11-02 → 11-03 (25 hours apart).

Each bucket gets more than one row: with only 1, "the whole group leaked out"
and "one extra row slipped in" look the same in the assertion.

## Cleanup

The table is deleted in a `finally`. A failed cleanup is only a warning — that
is the test's own housekeeping, not the product being wrong.

## Expected status

`status: fixed`. The matrix reproduces the bug on the commit immediately before
the fix and comes back clean on develop, so a reproduction from here on is a
regression rather than the world before the fix.

The case carried `status: open` and a midnight-only fixture until that fixture
was found to be green on both sides — see property 2 above. The status flip and
the fixture repair belong together: flipping the status alone would have
recorded a fix as confirmed on the strength of a case that never observed the
bug.
