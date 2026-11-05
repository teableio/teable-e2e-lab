# search/a-search-highlights-inside-a-large-selection

**T8327** — fixed in `5f7bc39d9`.

## What the user sees

Someone selects about a thousand rows and searches within them: nothing is
highlighted, and the request behind it is rejected for being too large.

## What the checkpoint asserts

A search-matches request scoped to 1000 selected record ids answers 200 and
returns exactly the matching rows among them.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with
1000 rows; the last 3 carry the needle. The highlight scope names every row
of the table, so all 3 matches are inside it.
