# link/y57-candidate-filter-survives-tabs

## Source

Y57 tracks T6679, fixed by
[teable-ee PR #2982](https://github.com/teableio/teable-ee/pull/2982)
at commit `9c36d27d1`. Switching a one-many link editor from **All** to
**Selected** cleared `filterLinkCellCandidate`; switching back did not restore
it. The **All** list then included children already owned by another parent,
and the user learned that only after submission failed.

The shipped implementation follows the issue's allowed hidden-candidate
contract: occupied children are filtered out instead of displayed disabled.

## Fixture

Setup uses product APIs before browser interaction:

1. Create a foreign test-case table with a free child and an occupied child.
2. Create target Issue B and owner Issue A in a host table.
3. Add a one-way one-many link field and assign the occupied child to Issue A.
4. Query Issue B's candidates directly and prove v2 returns only the free
   child.
5. Open Issue B's real grid link editor in Chromium.

## Checkpoint

`candidate-filter-survives-selected-all-switch` first proves the initial
**All** request is correctly filtered. It then switches **All** -> **Selected**
-> **All** and waits until each tab state is active. If returning to **All**
issues a new records or row-count request, the checkpoint asserts that it:

- still carries Issue B's `filterLinkCellCandidate` tuple;
- includes the free child; and
- excludes the child owned by Issue A.

The fixed UI can instead reuse the initial **All** query because the restored
candidate filter produces the same query key. In that path, the checkpoint
asserts that no unfiltered request occurs and that the candidate grid remains
visible after the tab switch.

The checkpoint observes the browser's real UI state and public-API traffic; it
does not infer UI correctness from a separate API-only call.

## Expected status

`status: fixed`. The checkpoint must reproduce on `9c36d27d1^` by observing a
missing candidate filter or the occupied child, and pass at `9c36d27d1` and
later revisions.
