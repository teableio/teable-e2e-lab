# aggregation/y875-a-day-of-rows-and-one-total

**T7060** — fixed.

## What the user sees

A table grouped by a date column that shows a day. The rows land under the
right headings, and the number each heading should print — the total of a
number column for that group — is blank. The total at the foot of the table is
correct.

Nothing reports an error. A blank where a number belongs reads as the grid not
having drawn yet, so this is the kind of thing people re-open the page for
rather than report.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent `764aee642`
and `develop`.

## How the case is built

Three rows and a date column formatted as a calendar day in `Asia/Shanghai`:
two rows on 2026-08-06 eight hours apart, one on 2026-08-07. The list groups
them into two headings; the totals should be 30 and 5.

The two rows sharing a day must be written at different instants. That is the
whole disagreement — grouping by the formatted day puts them together, grouping
by the raw timestamp splits them — and a fixture where every heading holds one
row would group the same either way and be green on both sides. The runner
refuses such a fixture rather than reporting on it.

## What the checkpoint asserts

That the grouped aggregation answers a number for every heading the list shows,
and that those numbers are the sums of the rows under them. Both halves matter:
a missing key and a key carrying the wrong sum are different faults, and the one
this case is about is the first.

The foot total is checked first and separately. It was correct throughout, so a
wrong one means something other than this bug.

The grouping itself is verified before the checkpoint. Without headings there
is nothing for the totals to be missing from, and a table that never grouped
would look identical from the aggregation side.

## Limits

One statistic (sum) and one timezone. The truncation the fix aligns is shared
by every date-like group, so the other statistics ride on the same expression,
but nothing here exercises them. The month shape is
`aggregation/y876-a-month-of-rows-and-one-total`.
