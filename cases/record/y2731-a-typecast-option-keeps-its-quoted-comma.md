# record/y2731-a-typecast-option-keeps-its-quoted-comma

**T7823** — fixed in `5255dd724`.

## What the user sees

An import of tags whose names contain commas produces broken tags on the rows
and in the column's option list, which then have to be cleaned out by hand.

Observed before the fix (`befc65538`): `"A, B", C` landed as three options,
`"A`, `B"` and `C` - quote marks and all - and the column gained all three.

## What the checkpoint asserts

The write answers 2xx from v2, the row holds `["A, B", "C"]`, and the
column gained exactly the options `A, B` and `C`.

## What the fixture has to hold

A column with no options, so every option it ends up with came from this
write.
