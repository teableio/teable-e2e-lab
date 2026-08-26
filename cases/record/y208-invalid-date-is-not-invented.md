# record/y208-invalid-date-is-not-invented

**T6517** — fixed. The lead case of two on the `value-normalization` runner;
the sibling is `record/y209-rating-is-stored-in-whole-stars`, and the shared design
is here.

## What the user sees

A row carrying a date nobody entered. `2026-02-30` was written — a typo, a bad
export, a spreadsheet column someone filled by hand — and the cell now reads
March 2nd. Nothing was reported; the value was corrected into a legal date that
happens to be wrong.

## Why this class of case exists

Typecast is what makes an import work: the value arrives as text and the field
decides what to do with it. That decision is not cosmetic — it is what filters,
formulas and every later read see — and v2's answers had drifted from v1's in
several places at once. The cases here are two of those answers, and they
share a runner because the shape is identical: write a value the field cannot
hold as written, read the cell back.

A third was built and dropped: clearing a filled cell (T6511, empty string
where v1 stored null) already stored `null` on its fix's parent, so it was
green on both columns. It is recorded in `docs/triage-ledger.md`, and the
runner keeps its `emptyValue` shape.

The drift matters most on bases that moved from v1, where the same column ends
up holding values normalized two different ways.

## What the checkpoint asserts

The stored value, not the status code. Every one of these writes succeeds on
both sides of the fix; what differs is what ends up in the cell. `null` as the
expected value means the field refused to invent something, which for all three
is the point.

The write goes through raw axios with the status left open, so a build that
refuses the value outright is reported as what it is rather than thrown as a
client error.

## Limits

One value per case. The fixes cover ranges — every invalid calendar date, every
fractional or out-of-range rating, every kind of empty — and these three probe
one point each. A fix that special-cased February would pass here.
