# record/y154-bulk-update-100-mixed-lands

Ported from `record/update-100-mixed` in this repository's predecessor (a
Python acceptance system). The full argument for its design is kept below.

## What it covers

The bulk-update write path: 100 existing rows, four batches, **every field of
every row** changed to a new value, then a cell-by-cell proof that all of it
landed.

The regression it exists to catch is **"the update answered 200 and only part
of it landed"** — no rows missing, and sampling may well hit the rows that did
update, while one batch or one column silently did not. Status codes, row
counts, and sampling are all blind to that class of failure. Only a full scan
sees it.

## Phases and the verdict boundary

Anything failing before the checkpoint is 💥 error (the case could not run);
only a failure inside it is the bug reproducing.

**Setup (failure = error).** Create a dedicated table in the seed base with
four field types (singleLineText / longText / number / checkbox), passing
`records: []` explicitly; seed 100 rows at revision 1; full-scan them to prove
every row and every cell **sits at revision 1**. That step is not ceremony:
every conclusion below rests on the rows starting at values that differ from
the targets, and if a row already held its target value, a completely broken
update would still scan clean. The scan also establishes the row-number →
record-id mapping.

**The measured write (failures recorded, not thrown).** Four `updateRecords`
calls of `batchSize=25`, taking every row to revision 2. A non-2xx batch is
recorded and the run continues — "how many of the 100 rows were updated" is the
single most useful fact when diagnosing this failure, and throwing on the first
bad batch discards it.

**Checkpoint `every-cell-landed` (failure = ❌ bug reproduced):**

- all four batches answered 2xx;
- the record counts echoed back by the four responses sum to 100 — this
  endpoint does not error on a record id it does not recognize, it quietly
  drops it from the returned array, so "how many came back" exposes a
  server-side skip one step earlier than the status code does;
- the full scan: every cell of every row equals the value derived locally for
  revision 2 (at most the first 10 mismatches are printed);
- the number of rows still entirely at revision 1 is zero — it answers what a
  truncated list cannot: "3 rows were not updated" and "none of the 100 were
  updated" look identical in the first 10 lines;
- the row count is still 100, and the record-id order matches the seeded one
  exactly, proving the update edited in place rather than deleting and
  recreating.

## Deterministic data

Values are a pure function of (row number, revision); the formula lives in
[`framework/runners/record-values.ts`](../../framework/runners/record-values.ts):

| type           | revision 1 (seed)             | revision 2 (after update)        |
| -------------- | ----------------------------- | -------------------------------- |
| singleLineText | `Title-7`                     | `Title-7-r2`                     |
| longText       | `Description row 7\nline two` | `Description row 7-r2\nline two` |
| number         | `7 × 1`                       | `7 × 2`                          |
| checkbox       | even rows `true`, odd empty   | **parity inverted**              |

The load-bearing property: for every row and every field, revision 1 ≠ revision 2. Without it, "this row was never updated" is invisible on any cell where the
two revisions coincide. It is guarded by the `no cell survives a revision bump`
test in `record-values.test.js` rather than trusted by reading the code.

**Writing an explicit null reads back as an absent key.** Omitting a field in
the PATCH body keeps its current value, so clearing a checkbox requires an
explicit `null` — and once cleared, the key is gone from the response entirely.
That makes the request shape (`updatePayloadRow`, which writes every field) and
the expected shape (`expectedRow`, where empty cells are absent) asymmetric,
and the comparison runs both ways: a key present in the scan but absent from
the expectation is a mismatch too. Without that direction, "the cell that
should have been cleared was not" would be an entire class of failure the case
cannot see.

## Cleanup

The table is deleted in a `finally`. A failed cleanup is only a warning — that
is the test's own housekeeping, not the product being wrong.

## Expected status

`status: fixed` (sentinel semantics): this write path must be correct on every
revision under test.
