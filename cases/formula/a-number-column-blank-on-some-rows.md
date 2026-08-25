# formula/a-number-column-blank-on-some-rows

**T4128** — fixed.

## What the user sees

A worked-out column that is empty on every row, including the rows the rule was
supposed to fill in.

"Show the amount only when it is over the threshold" is an ordinary column to
write, and it is deliberately blank on most rows — that is what makes it
readable at a glance. A number column with nothing in it is an everyday thing,
and a number column that has nothing in it _because a rule said so_ should be
the same thing.

It was not, underneath. The rule produced an empty piece of text where a number
was expected — neither a number nor nothing — and the column could not be
filled in at all. The rows that did have a number lost it too, over a rule that
was only ever about the other rows.

## What the checkpoint asserts

The rows over the threshold hold their number, and exactly the rows under it
come back empty.

Both halves, because a column that came back entirely empty satisfies one of
them and is exactly what a broken column looks like.

## How the rule says "nothing"

With the blank the formula language offers, this is green on both columns —
measured, run 32868816376. The shape the column could not swallow is the empty
piece of text, which is what most people write first.

## What the fixture has to hold

Amounts on both sides of the threshold. With all of them on one side, a column
that is entirely empty and a correct one would look the same.

The amounts are stored as written before the rule is added — a column blank
because its source is blank would say nothing about a rule that blanks it.
