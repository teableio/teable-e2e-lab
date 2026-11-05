# search/a-search-finds-matches-after-a-long-run-of-non-matching-rows

**T8327** — fixed in `5f7bc39d9`.

## What the user sees

Searching a large table for a value that only appears in its last rows: the
search keeps spinning and the grid never jumps to a hit.

## What the checkpoint asserts

The first search-matches page, asked for 100 matches, returns every matching
row at the end of the table, and says there is nothing more to fetch.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with
1000 rows whose only matches for the needle are the last 3.
