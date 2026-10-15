# lookup/y2935-a-conditional-sum-drops-sort-and-limit

**T7754** — fixed in `c3bc8daf6`.

## What the user sees

A total reads 30 where the matching rows add up to 60. Sort and limit are
left over from the column's life as a list, and nothing on the column says
they still apply.

## What the checkpoint asserts

The create answers 2xx from v2, the stored options carry neither `sort`
nor `limit`, and the row holds the sum of every matching amount.

## What the fixture has to hold

Three matching amounts with a limit of one, sorted largest first: the
truncated answer (30) and the full sum (60) are different numbers.
