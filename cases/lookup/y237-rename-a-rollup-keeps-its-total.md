# lookup/y237-rename-a-rollup-keeps-its-total

**T6250** — fixed.

## What the user sees

A rollup column is renamed — the smallest edit there is, and one that says
nothing about the values. The request is refused, with a message about column
types that has nothing to do with what was asked.

Which tables this happens on is not visible from the product. Two bases look
identical and only one refuses the rename: the one whose storage was carried
over from an older version.

## Why

The rename recomputed the whole column instead of treating it as a change to
the column's description of itself. On the older storage that recompute cannot
be written, so the whole request fails.

## What the checkpoint asserts

The rename is accepted **and** the total is the same number afterwards. A
version that accepted the rename by recomputing successfully would still be
doing what the fix removed; a version that accepted it and cleared the column
would be worse than the refusal.

## What the fixture has to hold

The older storage is made with SQL, as setup before the checkpoint: the product
does not produce it on request any more. It is what tables migrated from the
previous version carry.

Three linked rows summing to 60, so a total that changed is visible rather than
coincidental.
