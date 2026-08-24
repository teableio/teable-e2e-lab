# view/a-payroll-view-over-a-looked-up-total

**T6912** — fixed.

## What the user sees

A payroll view that will not open. The error names a totalling rule nobody
wrote, and the person has no way to find it in the interface.

The sheet is an ordinary one. Rate changes live on their own rows; each
employee carries the highest of them; each payroll line borrows that rate and
the employee's site so the view can be filtered by site. The borrowed total
carries a copy of the totalling rule, and a column converted back and forth can
end up without it — enough left to display the column, not enough to load the
table it sits on.

## What the checkpoint asserts

The filtered view opens and lists the payroll line, still carrying the borrowed
site.

The borrowed total's own value is not asserted: with its rule gone there is no
correct number to expect, and the question this case asks is whether the table
loads at all.

## What the fixture has to hold

The chain works before the rule goes missing: the employee's highest rate reads
back as the seeded rate, and the payroll view already opens and shows the line
with both borrowed values. Without that, a view that never worked and a view
broken by the missing rule would look the same.

Two sites, so a filter that kept everything and a filter that kept the right
rows are distinguishable.

The missing rule is written with SQL: no request produces that state, which is
also why nobody can put it back from the interface.

## Why the undamaged chain is not the case

Built through the ordinary requests and left alone, this exact three-table
shape works on both sides of the fix — measured, run 32708030924. The case
needs the missing rule to say anything.

## Relationship to the SQL-written sibling

`record/a-row-when-a-looked-up-total-lost-its-rule` (T6911) reaches the same
state and asks a different question: from there a row can still be added and
the table still lists. That case is green on this fix's parent — measured, run 32705941080. This case is the half that was still broken afterwards: opening
the view.
