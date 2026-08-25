# filter/a-group-inside-a-group

**T4066** — fixed.

## What the user sees

A filter they built correctly, and a table that disagrees with it.

Groups are how a filter says something a flat list cannot: this, and either of
those. The word between the conditions inside a group belongs to that group —
that is the whole point of putting them in one — and a person builds the
nesting precisely because "and" at the top and "or" inside are different
questions.

An inner group was joined with the word from the level above it. Asking for
"either of these" got "both of these", which nothing satisfies, so rows vanish
from a view whose filter reads correctly on screen.

## What the checkpoint asserts

The filter returns exactly the rows the nesting asks for, and the count at the
top of the view agrees with them.

The count is worked out separately, and a filter that two parts of the product
read differently is worse than one they both read wrong.

## What the fixture has to hold

Unfiltered, every row is there — a table that came back short would make the
filtered answer unreadable.

Both wanted values are present and differ, and at least one row holds neither,
so a filter that returns everything cannot look correct. The runner refuses any
other fixture.
