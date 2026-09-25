# formula/a-blank-that-becomes-a-number-and-back

**T7609** — fixed. On the `formula-cascade-blank-number` runner.

## What the user sees

Three formulas, each built on the one before:

1. a rounded number when an input is above zero, otherwise blank (`""`);
2. that parsed back to a whole number, or a placeholder when it is blank;
3. half of the second.

Changing the input so the first one turns from blank into a number is
refused: the edit fails with `invalid input syntax for type numeric: ""`.
Worked out together, the first formula's value was a number in the middle of
the calculation, while the second compared it with `""` as text.

In production the calculation ran in the background, so the edit went
through and the second and third formulas silently kept stale values.

## What the checkpoint asserts

The input goes 0 → 5 → 0. After each edit the three formulas read exactly the
values worked out locally from the expressions: `"17"`, 17, 8.5 for 5, and
blank, 99999, 49999.5 for 0. The case waits up to the settle timeout for them.

## Why the fixture is shaped this way

The formulas are created one at a time, each after the one before, so none is
filled in as part of creating the next - the failure is in the calculation an
edit starts, not in filling in a new column. The engine is proved on an edit
to the row's name, outside the checkpoint.

A hybrid-strategy variant of this case was tried and was green on every
column (run 36121868574): at the lab's default settings the background pass
does not put all three levels into one batch. It was not kept.

## Evidence

Run 36121868574: the edit was refused with `invalid input syntax for type
numeric: ""` on `b4908f0a4d`, `e14c3f4b10` and `402ba3520d` (the fix's
parent); absent on `develop` (`37830698a4`).
