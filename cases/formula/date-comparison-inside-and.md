# formula/date-comparison-inside-and

**T5496** — fixed.

## What the user sees

A status column built on a date — "is it overdue", "is it still inside the
window", "did it happen after we shipped" — says yes to every row that has a
date in it. Rows plainly outside the window come out on the same side as the
ones inside. The column still looks like an answer, and everything built on it
(filters, colour rules, rollups, the count on a dashboard) inherits the wrong
one.

## Why

The date comparisons were not on the list of things that produce a yes or a no.
Nested inside AND or OR, their result fell through to a different rule — _has a
value, therefore yes_ — so the comparison itself was discarded. Any row with a
date qualified.

## What the checkpoint asserts

Both sides in one read. A row the window excludes must read as no, and a row it
includes must read as yes. Asserting only the excluded row would let a column
stuck on _no_ pass; asserting only the included one would let a column stuck on
_yes_ pass, which is precisely the bug.

## What the fixture has to hold

At least one row on each side — the runner refuses otherwise. This case carries
three: before the window, inside it, and after it, so a comparison that got the
direction wrong is also caught.

Neither operand of the AND is a constant. If one were, the combinator could
answer from it alone and the comparison would never have to decide anything.

## The sibling case

`formula/date-comparison-inside-or` is the same runner with OR, which is the
shape a status column takes when either of two dates qualifies a row.
