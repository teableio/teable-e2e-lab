# filter/y173-search-a-borrowed-link-column

**T6923** — fixed.

## What the user sees

A search that finds nothing while the thing being searched for is on screen.

A column that borrows a link from another table shows names, the same as the
link column it borrows from. Typing part of one of those names into "contains"
is how a person looks for anything in a table with more rows than fit on a
screen. It returned nothing — not the wrong rows, nothing, every time.

There is no error and nothing to report. The view is empty, and the natural
reading is that the rows are not there.

## What the checkpoint asserts

Filtering the borrowed column by part of a name returns exactly the row whose
borrowed link shows that name.

## What the fixture has to hold

The borrowed column really shows the names being searched — the case reads them
back before it filters. Without that it could not tell "the filter found
nothing" from "there was nothing to find".

Two target names sharing no letters, and a search term that is part of the
first and not of the second. The runner refuses any other combination, because
otherwise a filter that matched everything and a filter that matched the right
row would give the same answer.
