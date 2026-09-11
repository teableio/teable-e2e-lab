# lookup/y881-a-narrowed-total-read-from-another-base

**T7075** — fixed.

## What the user sees

One number written down in four places: a total over linked rows narrowed by a
condition, a column showing that total, and two columns in another base reading
both. The number underneath changes, the near columns follow, and the report in
the other base still shows the old number.

Nothing on the row says it is stale. The source row says 15, the summary beside
it says 15, and the report somebody actually sends says 10.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why the condition matters

A total with a condition on it was worked out one linked row at a time while
the rows it depends on were being updated. A host carrying several such totals
could run past the time a single statement is allowed and be dropped
altogether — and everything downstream keeps whatever it last held.

The fixture keeps a line the condition does not count, so a condition that was
dropped would give a different number and could not be mistaken for a correct
one.

## How the case is built

A source table, a host row linked to two lines — one counted, one not — and a
second base holding the report. The lines are written and linked after the
columns exist, because that is the order the report came in as: it puts the
work on the update path rather than on the create.

Before the checkpoint all four columns must already agree on the first number.
Four stale values and four values that never computed look the same otherwise.

## What the checkpoint asserts

After the counted line's amount changes, all four columns read the new number
within the settle window — and the error names which of them did not, because
the near ones following while the far ones do not is the half people report.

## Limits

One narrowed total and one host row. The report describes a host carrying about
ten such totals; a single one is enough to observe whether the update reaches
the end of the chain, but not to observe the time limit the fix is about.
