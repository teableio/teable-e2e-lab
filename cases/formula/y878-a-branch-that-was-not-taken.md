# formula/y878-a-branch-that-was-not-taken

**T7122** — fixed.

## What the user sees

A column written as "if there is no baseline, say so, otherwise say how far off
we are", added to a table that already holds rows. The rows with no baseline —
the ones the first branch exists for — come back empty, or the column arrives
blank for everybody.

The formula is accepted. Nothing is flagged. There is no error to read and no
way to tell from the table that the answer was decided by a branch nobody
asked for.

## What was measured

On the fix's parent `b6b577618` the two rows with no baseline read nothing —
`no-baseline` and `blank-qty` both come back `null` where "no baseline"
belongs, after 60s of polling — while the two rows that take the other branch
read correctly. The column is not flagged. On `375e14ef2` and on `develop` all
four rows read their branch. Run 34560377621.

## Why the branch that is not taken matters

Working out "how far off we are" divides by the baseline total. On a row with
no baseline that is a division by zero — which is exactly why the formula asks
for the other branch there. Both branches were worked out anyway and the error
from the unused one was applied to the answer.

## How the case is built

Four rows and two intermediate worked-out columns: a baseline total, and a
variance rate that divides by it. Then the column under test, a nested choice
over the two. One row has a baseline of zero, one has no quantity at all, and
two have real baselines going up and staying flat — so both branches are taken
by something, and a column answering the same thing everywhere cannot pass.

Adding the column to a table that already holds rows is the trigger: this is
the fill-in of existing rows, not the working out of a new one, and those are
different paths.

## What the checkpoint asserts

Every row reads the branch that was taken — each expected answer derived
locally from the same numbers the fixture writes — and the column is not
flagged as broken. A column that reads correctly and carries a warning is its
own fault and is reported separately.

Values are polled, because filling in existing rows is not always finished when
the column create answers.

## Limits

One nesting depth and one arithmetic error (division by zero). The simpler
empty-string-branch shape does not reproduce through the public API at all —
see `docs/triage-ledger.md`.
