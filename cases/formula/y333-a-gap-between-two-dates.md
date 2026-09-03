# formula/y333-a-gap-between-two-dates

**T2328** — fixed.

## What the user sees

A column measuring how long something took reads `2` where it should read
`172800`. The formula is the short form — the gap between two dates, without
saying in what unit — and the language it is copied from answers in seconds.

Nothing marks it. A column of small numbers looks like a column of small
numbers; the threshold, total or chart built on it is wrong by a factor of
86,400, which is not a mistake anyone reads off the values.

## What the checkpoint asserts

The number is the gap in seconds. The failure message says explicitly when the
value is the gap in **days** instead, because that is the shape of the wrong
answer and naming it saves the next reader the arithmetic.

## What the fixture has to hold

A whole number of days between the two dates, so the wrong answer is a clean
number and cannot be mistaken for rounding, and a finish after the start, or
every unit would agree on zero. The runner refuses both.
