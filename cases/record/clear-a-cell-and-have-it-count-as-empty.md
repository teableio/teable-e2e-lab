# record/clear-a-cell-and-have-it-count-as-empty

**T6520** — fixed.

## What the user sees

A cell they just cleared, sitting blank in the grid, that the product still
treats as filled in.

There are two ways to say a cell has nothing in it. The interface says it one
way: deleting the text leaves an empty piece of text, unticking the box leaves
a no, removing the last tag leaves an empty list. A cell that was never filled
in says it the other way — it holds nothing at all.

Stored as they arrive rather than made the same, the two are different values.
The cell is blank on screen and not empty to anything that asks: a filter for
empty cells skips the row, and the person can see the blank cell the filter
just refused to find.

## What the checkpoint asserts

1. All three cleared cells — text, box, list of tags — read back holding
   nothing.
2. The filter for empty notes finds the row that was just cleared, **and**
   still finds the row that was never filled in.

The filter is what makes this a report rather than a detail about storage. It
is the place a person meets the difference.

## What the fixture has to hold

Before the clear, the filter finds only the row that was never filled in. A
filter that found everything, or nothing, would look like the right answer
afterwards.

A second row that is left alone throughout, so the filter can be wrong in
either direction: missing the cleared row, or losing the untouched one.
