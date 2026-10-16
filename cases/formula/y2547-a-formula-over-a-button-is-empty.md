# formula/y2547-a-formula-over-a-button-is-empty

**T7819** — fixed in `b6f2d8ef7`.

## What the user sees

A formula over a button shows `{"count": 1}`, and whatever it feeds — a
label, a concatenation, a filter — carries that text.

## What the checkpoint asserts

With the button at one click and again at three, the button holds its
count and the formula reads empty.

## What the fixture has to hold

Two counts, so a formula that missed one update cannot pass by
accident.
