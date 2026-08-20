# base-share/save-into-existing-base-twice

## Where the bug came from

T6840. A user saved a shared app into an **existing base** (`Save to my space`
→ `Existing base`), the page reported success after `Duplicate`, and the target
base showed nothing. Saving it a second time answered `Internal server error`.

One user action, two independent faults. The case puts them in a single
checkpoint, because to the user they are one thing that did not work:

1. **The second save answered 500.** The v2 copy path `createFoldersV2`
   inserted folders under their original names and hit the
   `base_node_folder (base_id, name)` unique index. The v1 path had deduplicated
   with `getUniqName` for a long time; v2 never did.
2. **The first save was invisible.** The v2 copy writes `base_node` rows with
   raw SQL and emits no per-resource events, so the target base's node-list
   cache kept serving its pre-copy contents until some unrelated node change
   happened to flush it. The fix adds a `BASE_SHARE_COPY_COMPLETE` listener to
   `BaseNodeListener`.

## Why the fixture shares a folder and nothing else

The second fault is hidden by a cache, and **creating a table emits
`TABLE_CREATE`, which flushes that same cache**. Put one table in the share and
"saved but invisible" becomes unobservable — the case would be green on a
version that has the bug. So the fixture is one empty folder and no tables at
all: either the copy path flushes that cache itself or nobody does.

That is also the shape of the production report — what the user was saving was
**an app inside a folder**, not a table.

## Phases and the verdict boundary

**Setup (failure = 💥 error)**

1. Create a source base in the seed space and a folder node named
   `Shared Folder`.
2. Share that folder and set `allowSave: true` — saving into someone else's
   base is off by default, and without it every save answers 403 and the case
   never reaches its question.
3. Create the target base.

**Fixture verification (failure = 💥 error).** Read the target base's node list
and assert it holds no folder named like `Shared Folder`. This does two jobs:
it proves the starting state is clean (otherwise "the saved folders showed up"
is unanswerable), and it **warms the node-list cache** — that cached list is
the only thing a copy that forgets to flush it can keep serving.

**Checkpoint `repeated-save-into-same-base-lands` (failure = ❌ bug reproduced)**

- Save the same share into the same `baseId` twice; both must answer 200. The
  outcomes are **collected first and judged after**, rather than throwing on
  the first bad one: which save broke and with what status is the most useful
  fact about this failure, and throwing discards the rest of the sequence.
- Then **poll** the target base's node list until the folder names are exactly
  `["Shared Folder", "Shared Folder 2"]`. The cache flush runs after the copy
  has already answered, so reading once would misjudge it; exhausting the 15s
  budget is how "the save said it worked and the base looks unchanged" — the
  user's view of this failure — reproduces.

Anything thrown inside the checkpoint counts as the bug: a 500, a failed
assertion, or the poll timing out. Setup and fixture verification stay outside
so that problems like "the share API did not look like this yet on an old
revision" are judged 💥 rather than mistaken for this bug.

## Why the expected name is "Shared Folder 2"

`getUniqName` (`@teable/core`): an unused name is kept as is; a taken one gets
the first free `<name> <n>` starting from 2. So N saves expect
`name, name 2, ..., name N`, and `expectedFolderNames` in the runner is a
restatement of that rule, still correct if `saveCount` is raised.

The assertion compares the **sorted set of names**, not the presence of one
name: "only one of the two saves landed" and "the second overwrote the first"
are indistinguishable under an assertion like "Shared Folder 2 exists".

## Deterministic data

Both base names carry the runId to avoid collisions; the folder name is a fixed
literal, because the expected value is a function of it. The copy runs with
`withRecords: false` — this bug has nothing to do with record content, and
carrying records would only make the case slower and more fragile.

## Cleanup

`permanentDeleteBase` in a `finally`, target before source. A failed cleanup is
only a warning — that is the test's own housekeeping, not the product being
wrong.

## Expected status

`status: fixed`. The fix is on develop (3b1bfd0d7, 2026-08-19); reproducing it
again is a regression.
