# field/y336-change-only-the-instruction-behind-a-column

**T6606** — fixed.

## What the user sees

A long-text column with an AI instruction behind it. The person opens the field
editor, picks a different model, saves — and is shown the confirmation dialog
the product uses before it rewrites a column's values.

Nothing is rewritten. The instruction is stored; nothing is recomputed until
the person asks for it. The dialog is asking them to approve work that will not
happen.

That is worse than a cosmetic annoyance. The dialog is the product's own answer
to "what will this do", and it only works while it means something. A warning
that appears for changes that cost nothing is a warning people learn to click
through, and the one time it matters they click through that too.

## What the checkpoint asserts

The plan the product returns for that save is `skip` — the change touches no
data.

The plan is what the dialog is drawn from, so it is what the case reads. The
dialog itself is not observable from here, and asserting on it would be
asserting on the front end rather than on the decision.

## What the fixture has to hold

The column is a long-text column and it carries the instruction, so the plan is
answering the question the case is asking.

The stored settings are put into their clean shape with SQL. A column made
while the misreading was live stores the misread shape too, so a column created
and immediately re-read would compare a wrong thing against the same wrong
thing and agree — the case would be green on the fix's parent for no reason.
On the fixed build the same write changes nothing.

## What was actually wrong

The settings a long-text column carries were matched against a rule meant for a
column that tracks modification time, which quietly added a modification-time
formula to them. The stored settings and the resubmitted settings then differed
by a formula nobody wrote, and a difference in formulas is exactly what the
product treats as a rewrite.
