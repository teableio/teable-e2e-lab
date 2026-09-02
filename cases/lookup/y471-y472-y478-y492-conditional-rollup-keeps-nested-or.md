# lookup/y471-y472-y478-y492-conditional-rollup-keeps-nested-or

**T7080** - fixed. Covers **Y471, Y472, Y478, and Y492**.

## What the user sees

A conditional summary combines a row-specific match with a nested choice:
the source key must equal this row's key, and either flag A is no or flag B is
yes. The nested OR is ignored or joined at the wrong level, so valid rows are
missing from the result.

## How the case is built

One source table supplies single-line text, long text, rating, and number
values. Each summary isolates its variant and applies the same field-reference
match plus nested OR. Included, excluded, wrong-key, and no-match rows make the
condition's boundaries observable.

## What the checkpoint asserts

Text and long-text counts are one, the rating sum is two, and the number sum is
sixty across all four OR truth combinations. A host key with no source rows
stays zero.
