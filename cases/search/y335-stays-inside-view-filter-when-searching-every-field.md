# search/y335-stays-inside-view-filter-when-searching-every-field

**T6916** — fixed.

## The bug

Type something into the search box while looking at a filtered view, and the
search reported hits on rows the view does not show.

`search-count` and `search-index` applied only the filter carried in the
request. The grid sends a `viewId` and lets the server resolve what that view
means — the same thing `row-count` does, which merges the view's stored filter
before counting. Search did not merge it, so a request naming a view and no
filter searched the whole table.

The visible result is a count that does not match the rows on screen, and a
next-match jump that lands on a record the user filtered away.

## What the checkpoint asserts

Searching the view by `viewId` alone:

1. `search-count` returns the number of rows that are **both** inside the view
   filter and matched by the term.
2. `search-index` returns hits on exactly those records, by id.

Assertion 2 is not a restatement of assertion 1. A count can be right for the
wrong reason — lose one row the view keeps, gain one it hides, and the total is
unchanged. The hit list names which rows answered, so the two together pin the
set rather than its size.

## The fixture, and why it has four quadrants

Six rows across two independent axes: inside or outside the saved view filter
(`Region is Keep`), matched or not matched by the search term. Every quadrant
is populated, and three of them are load-bearing:

| quadrant            | what it rules out                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inside, matched     | the answer itself — without it the expectation is 0, which is also what a search that finds nothing returns                                                                        |
| outside, matched    | the over-count the bug produces — without it the whole-table search and the view search return the same number, and a red column is impossible                                     |
| inside, not matched | keeps "the search ran" apart from "the filter ran" — without it the view's row count equals the expected hit count, so a query that ignored the search term would still look right |

The runner refuses a fixture missing any of the three, with the reason. The
fourth quadrant — outside and not matched — is padding; nothing reads it.

Each required quadrant is seeded twice, so one mis-seeded row cannot quietly
collapse the fixture into a shape that only appears answerable.

The searched field is a single-select and the term is one of its two choice
names. "Matched" is then a property of the fixture rather than of substring
behavior this case is not testing.

## What is checked outside the checkpoint

Two fixture facts, because a failure in either is the lab's problem and not the
product's:

- The saved filter is live on a plain read — the view returns its three
  `Keep` rows. Everything inside the checkpoint is "search agrees with the
  view", so a view that was not filtering at all would make the checkpoint
  agree with nothing.
- The same search asked to **ignore** the view finds all four matched rows.
  This is what makes the number inside the checkpoint readable: the term
  matches what the fixture thinks it does, and the hidden rows are findable, so
  a smaller number inside the view is the filter being applied rather than the
  search having stopped matching. Ignoring the view is correct behavior on both
  sides of the fix, which is why it sits out here rather than in.

## A note on the routing proof

Every case here asserts that v2 answered, on a response the case depends on.
This one takes that proof from saving the view filter rather than from the
search.

The fix did two things at once: it merged the view filter into the search
query, and it routed authenticated search onto v2. So on the commit before the
fix, search is answered by v1 — and asserting v2 there would turn the pre-fix
column from "the bug reproduced" into "the lab could not run". A case that
cannot go red proves nothing, so the assertion is anchored on the operation the
fix did not move, and the engines that answered each search are recorded in the
artifact as data instead.

Storing the filter is a genuine dependency, not a convenient probe: the bug is
that a stored view filter is ignored, so a filter stored by some other engine
would leave the checkpoint watching the wrong thing.

## How this differs from its sibling

`search/y189-stays-inside-view-filter` names the column to search. This case sends
the term on its own — every column at once, the way the grid's search box does
— and the table carries a date column so one of the searched columns is a date.
That is the shape where the filter was dropped; the sibling was green on this
fix's parent, run 32703022098.

The date column carries no part of the fixture's meaning: the two axes are
still the region and the type.
