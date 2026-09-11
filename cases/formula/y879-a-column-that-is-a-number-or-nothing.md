# formula/y879-a-column-that-is-a-number-or-nothing

**T7122** — fixed.

## What the user sees

A column written as "if the amount is zero or less, nothing, otherwise the
amount", added to a table that already holds rows. The column arrives blank for
every row, including the ones that should carry the number.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent `b6b57761`,
`375e14ef2` and `develop`.

## Why this shape as well as y878

It is the same fault with nothing around it: no intermediate columns, no
nesting, no division. The unused branch is an empty string where the other
branch is a number, and the fill-in fell over on the empty string. Carrying
both shapes is what says the nesting in y878 is not what matters.

## How the case is built

Three rows — one at zero, one positive, one with no amount at all — and the
column added afterwards. Both branches are taken, so a column answering the
same thing everywhere cannot pass.

## What the checkpoint asserts

The positive row reads its number and the other two read nothing, with the
column unflagged. Values are polled for the same reason as in y878.

## Limits

One comparison and one numeric type.
