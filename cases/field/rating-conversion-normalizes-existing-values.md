# field/rating-conversion-normalizes-existing-values

**T6518** — fixed.

## What the user sees

A number column is switched to a rating. The grid now draws stars, and some
rows draw a number of stars that does not match what a filter on that column
returns — because the cell still holds 3.6, or 9, in a field that says it holds
whole numbers from 1 to 5.

## Why

A rating field's domain is part of its definition. Converting a column into one
has to answer for every value already in it: a fraction, a number past the
maximum, a zero, an empty cell. v1 normalized them; v2's conversion left
several as they were.

Nothing rejects the result — the values are numbers and the column takes
numbers — so it surfaces later, as filters and comparisons that trust the
declared domain disagreeing with what is drawn.

## What the case asserts

Four values, one per rule, and each has to land where the rating's own domain
puts it:

| in the number column | as a rating                  |
| -------------------- | ---------------------------- |
| 3.6                  | 4 — nearest whole star       |
| 9                    | 5 — clamped to the maximum   |
| 0.4                  | empty — a rating has no zero |
| 2                    | 2 — already legal, untouched |

The last row matters as much as the others: a conversion that emptied the
column would satisfy the first three.

The values are read back before the conversion too, so a number column that had
already rounded them would be caught rather than leaving the conversion nothing
to answer for.

## Its sibling

`record/y209-rating-is-stored-in-whole-stars` asks the same question about a write
rather than a conversion. A field can acquire a value outside its domain either
way, and the two paths were fixed separately.
