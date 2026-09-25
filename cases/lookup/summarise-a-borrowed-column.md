# lookup/summarise-a-borrowed-column

**T7513** — fixed. On the `rollup-over-lookup-values` runner.

## What the user sees

Three tables: source rows holding a label and an amount, a middle table that
borrows both through a link, and a top table that summarises the middle rows.
Two summaries go wrong when their input is itself borrowed:

- joining the labels gives a list printed as text instead of "Alpha, Beta";
- collecting the distinct amounts gives `["15", "20"]` - numbers turned into
  text - and the column, declared as numbers, shows nothing.

The same two summaries over plain columns holding the same values are right.

## What the checkpoint asserts

On the top row, joining the borrowed labels gives exactly "Alpha, Beta", and
the distinct borrowed amounts are exactly `[15, 20]` - numbers, in link order.
Both are checked on every run and reported together.

## Why the fixture is shaped this way

The middle table holds plain copies of the same label and amount beside the
borrowed ones, and the top table runs the same two summaries over those. They
are the control, checked outside the checkpoint: they were right before the
fix, so if they are wrong the harness or the data is off, and that is an error,
not this bug.

Two items, with different amounts: with one item a list and a single value can
print the same, and with equal amounts the distinct list is shorter than its
input for an unrelated reason.

## Evidence

Run 36120798558: reproduced on `ec8e89872c` and `acd982aceb` (the fix's parent) - the join gave `["Alpha"], ["Beta"]` and the distinct amounts `["15","20"]`, while the plain controls gave "Alpha, Beta" and `[15, 20]` - and absent on every later column through `develop` (`37830698a4`).
