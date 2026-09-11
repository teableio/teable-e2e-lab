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

A first attempt with a single narrowed total was green on the fix's parent
`0ad204535` — all four columns read 15 — run 34560984928. The report the fix
came from carried about ten narrowed totals on one link, and the commit message
names that number as what ran past the statement time limit, so the fixture now
builds ten. Pending: the run that settles whether that reproduces.

## Why the condition matters

A total with a condition on it was worked out one linked row at a time while
the rows it depends on were being updated. A host carrying several such totals
could run past the time a single statement is allowed and be dropped
altogether — and everything downstream keeps whatever it last held.

The fixture keeps a line the condition does not count, so a condition that was
dropped would give a different number and could not be mistaken for a correct
one.

## How the case is built

A source table, a host row linked to two lines — one counted, one not — ten
narrowed totals on that link, and a second base holding the report. The lines are written and linked after the
columns exist, because that is the order the report came in as: it puts the
work on the update path rather than on the create.

Before the checkpoint all four columns must already agree on the first number.
Four stale values and four values that never computed look the same otherwise.

## What the checkpoint asserts

After the counted line's amount changes, all four columns read the new number
within the settle window — and the error names which of them did not, because
the near ones following while the far ones do not is the half people report.

## Limits

One host row and one link. The number of narrowed totals on that link is a
config value because it is the load, not the shape, that the fix is about: a
single total travels the same code and finishes well inside the time limit.
