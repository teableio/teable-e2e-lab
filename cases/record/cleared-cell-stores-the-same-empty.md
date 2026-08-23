# record/cleared-cell-stores-the-same-empty

**T6511** — fixed. On the `value-normalization` runner; the shared design is
described in `record/invalid-date-is-not-invented`.

## This variant

Clearing a cell stored an empty string where v1 stored null. The two are
identical to look at and different to everything that asks whether a cell is
empty: filters, formulas, required checks.

A base that moved from v1 to v2 therefore ends up with two kinds of blank in
one column — the rows cleared before the move and the rows cleared after — and
an "is empty" filter returns some of them.

The cell is filled first and checked before the clear, outside the checkpoint.
Without that, "clearing it stored the wrong empty" would be about a cell that
was never filled.
