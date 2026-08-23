# record/inline-computed-in-update-response

**T5453** — fixed.

## What the user sees

You change one cell of a row. The answer that comes back says the row's formula
column still holds its old value. A grid repaints the row from that answer, an
automation carries the number into its next step, an integration writes the row
into its own store — all of them with a number that is no longer true.

The stale number is plausible: a commission that should now be zero comes back
as the old commission. Nothing about it reads as a failure.

## Why

Same-record computed values were only worked out before answering on some write
paths. A single-record edit was not one of them, so the answer was assembled
from the row as it stood before the formula ran.

## What the checkpoint asserts

The value in the answer to the write, not the value in the database. The row
does settle to the right number shortly after — a case that edited and then
read the row back would pass on the broken build.

The edited cell itself is checked in the same answer first, so a write that
simply did not take is reported as that, not as a stale formula.

## Telling the two failures apart

After the checkpoint the runner reads the row again and records what it settled
to. A red column with the right settled value means the recompute happened and
the answer did not say so; a red column with a stale settled value would mean
something else entirely and would need a different case.

## The formula has to be a real commission rule

A first attempt used a formula that was one number times another. Both columns
were green (run 32671032258, `e6c338e11` answered 600 correctly): a
single-level arithmetic formula is computed inline on the write path anyway.
The fixture now carries the shape a base actually has - gated on a status,
branching on the order type, rounded to money.

## What the fixture has to hold

The commission before the edit has to be something other than zero, or the
stale value and the correct one are the same number; the runner refuses
otherwise. Both expectations are computed from the rates in the config rather
than written down, so the fixture and the assertion cannot drift apart.

The runner checks the formula computes the old value before the edit. Without
that, a formula that never computed at all would look like the bug.
