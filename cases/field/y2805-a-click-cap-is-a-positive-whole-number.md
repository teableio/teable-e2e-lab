# field/y2805-a-click-cap-is-a-positive-whole-number

**T7769** — fixed in `69e60e8ca`.

## What the user sees

A cap of 0 reads as "no presses allowed" in one place and "no cap" in
another; a fractional cap is neither. Either way the button behaves
differently from what its settings show.

## What the checkpoint asserts

Each of the three caps is refused, and after each attempt the stored cap
is still the original 3.

## What the fixture has to hold

A valid starting cap (3), checked before the attempts, so "left
unchanged" is observable.
