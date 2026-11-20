# formula/numeric-switch-matches-by-value-in-a-column

**T8627** — fixed in `8bae75153`.

## What the user sees

A SWITCH formula over a number column returns its default value on every row, as if no case ever matched, once the column is shown with decimals.

## What the checkpoint asserts

For n = 0, 1, 2, 3, 1.004 and blank, `SWITCH({n}, 1, 1, 2, 3, 4)` reads 4, 1, 3, 4, 4, 4 and `SWITCH({n}, 1, "x", 2, "y", "z")` reads z, x, y, z, z, z. A third formula that returns another column reads x for 1 and that column for 2. The values are checked in stored formula columns. 1.004 is shown as 1.00 but must not take the branch for 1.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards: a label column and a number column formatted to two decimals, one row per value.
