# formula/date-comparison-inside-or

**T5496** — fixed.

## What the user sees

Same as its sibling `formula/date-comparison-inside-and`, with the other
combinator: a status column that qualifies a row when either of two date
comparisons holds says yes to every row that has a date at all.

## Why

The date comparisons were not on the list of things that produce a yes or a no,
so inside AND or OR they fell through to _has a value, therefore yes_. OR is
the worse of the two to lose: one operand reading as yes settles the whole
answer, so the column is stuck on yes even when both comparisons are false.

## What the checkpoint asserts

A row before the date reads as no, a row after it reads as yes. Both, in one
read — a column stuck on either value has to fail.

## What the fixture has to hold

`IS_AFTER` or `IS_SAME` against one date, which is how "on or after" is
written. Two rows, one on each side. The runner refuses a fixture with only one
side.
