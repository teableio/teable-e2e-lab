# record/rating-is-stored-in-whole-stars

**T6515** — fixed. On the `value-normalization` runner; the shared design is
described in `record/invalid-date-is-not-invented`.

## This variant

A rating field's domain is whole stars — the field itself advertises a maximum
and integer steps. Typecast only rounded values that were out of range, so an
in-range fraction like `2.7` was stored exactly as written.

Nothing looks wrong: the grid draws three stars. But filters, comparisons and
formulas that trust the declared domain now disagree with what is drawn, and a
`= 3` filter does not return the row the user sees as three stars.

The case writes 2.7 into a field whose maximum is 5 and requires the cell to
read 3.
