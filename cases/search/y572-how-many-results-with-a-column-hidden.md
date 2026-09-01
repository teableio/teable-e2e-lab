# search/y572-how-many-results-with-a-column-hidden

**T5067** — fixed.

## What the user sees

A search that says it found more than it shows.

Hiding a column is how a view is made narrow enough to work in. The count next
to the search box is the product's answer to "how much did this find", and the
list underneath is the same answer written out.

They disagreed. Rows matching only in the hidden column were counted and not
shown, so the count came out larger than the list — and there is no way to
reconcile the two, because the rows making up the difference are exactly the
ones the view is not showing. The person counts the rows on screen, gets a
smaller number, and has nothing to do with that.

## What the checkpoint asserts

With the other column hidden, the number of results equals the number of rows
that match in the column still shown.

## What the fixture has to hold

With nothing hidden, the term is found in both columns. That is what makes the
narrowed number readable: a smaller count is the hiding being applied, rather
than the search having quietly stopped matching.

At least one row matching in the visible column — otherwise the expected count
is zero, which is also what a broken search returns — and at least one matching
only in the hidden one, or counting the hidden column would give the same
number and the case could never go red. The runner refuses any other fixture.
