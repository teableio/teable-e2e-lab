# formula/a-column-that-picks-by-case

**T6980** — fixed. On the `switch-mixed-branch-storage` runner.

## What the user sees

A column that picks its value by case cannot be created. The rule is ordinary —
"cost depends on where the cost comes from": a manually entered figure for some
rows, a different figure for others, and otherwise whatever is linked. The field
editor offers every part of it. Saving fails, and the schema change it was part
of dies with it.

## Why

The first two answers are numbers. The last is a list of linked records, which
is stored as a document rather than as a number.

The step that merges the branches together compared only the branches with a
case attached. Those agreed — both numbers — so it never looked at what the
otherwise branch held. The database was then asked to choose between numbers and
a document in a single expression, and refused outright.

Nothing in the interface says the last branch is a different kind of thing from
the others.

## What the checkpoint asserts

The column can be made, is not immediately marked broken, and reads the right
number on the rows whose case has a number behind it.

Making the column is inside the checkpoint. Reconciling the branches happens
while it is built, so that is when the refusal happens; built in setup, the same
refusal would score as "this case could not run here" — the one verdict that
hides the bug.

The rows falling to the otherwise branch are read but not pinned to a value. What
a list of linked records renders as has changed before (see
`lookup/two-records-with-one-name-are-two-records`), and a case that pinned it
would be rewritten by a change that did not touch this behaviour. What matters
here is that the column exists and the numbered cases are right.

## Why the fixture is shaped this way

**Two** number branches, and the runner refuses fewer. The branches with a case
attached have to agree with each other — that agreement is exactly what stopped
the merge from looking any further. With one branch there is nothing to agree
with, and the merge may reach the otherwise branch on its own.

The linked column must hold a **list**, checked before the checkpoint: holding a
single value it would be the same kind of thing as the numbers, and there would
be nothing to reconcile.

## The v1 column

v1 reproduces this on **every** column of the acceptance matrix, `develop`
included. The fix is v2-only, so on the older engine a column of this shape still
cannot be made. Reported rather than enforced — the v1 column is a reference and
never gates a run.

That is the third case here to say the same thing about v1; the others are
`lookup/distinct-choices-in-the-order-they-appear` and
`lookup/two-records-with-one-name-are-two-records`.
