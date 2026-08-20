# link/y56-first-open-candidates-load

## Source

Y56 tracks T6680 and is associated with
[teable-ee PR #2982](https://github.com/teableio/teable-ee/pull/2982).
The expected behavior is that the first **All** view of a one-many link editor
loads eligible candidates immediately; the user must not need to switch tabs or
reopen the editor to populate the list.

This case is retained as an explicit expected-behavior guard. Local comparison
also passed on `9c36d27d1^`, so it does not claim that PR #2982 alone introduced
the behavior or that this exact fixture reproduces the historical defect.

## Fixture

Setup uses product APIs before browser interaction:

1. Create a foreign test-case table with a free child and an occupied child.
2. Create target Issue B and owner Issue A in a host table.
3. Add a one-way one-many link field and assign the occupied child to Issue A.
4. Query Issue B's candidates directly and prove v2 returns only the free
   child.
5. Open Issue B's real grid link editor in Chromium.

## Checkpoint

`first-open-shows-link-candidates` observes the first browser request without
performing a tab switch and asserts that:

- the request carries Issue B's `filterLinkCellCandidate` tuple;
- the response includes the free child;
- the response excludes the child already owned by Issue A; and
- the candidate grid is visible after the response loads.

The checkpoint ignores any historical actual-result text and asserts only the
expected product behavior through the real UI and public API response.

## Expected status

`status: fixed`. The checkpoint must pass on current fixed revisions. Because
the same fixture passes on `9c36d27d1^`, historical comparison for this case is
informational rather than proof of the fix boundary.
