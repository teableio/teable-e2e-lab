# field/y2932-a-total-follows-its-source-to-a-date

**T7752** — fixed in `402cb1ce8`.

## What the user sees

A column of numbers is changed into a date column, and a rollup in another
table that takes their largest value goes on presenting a number with a ring
display. On the revision it was reported against, the conversion did not
complete at all: it was refused with a database error about reading a date as
a number.

Observed before the fix (`6db59e39a`): the conversion answers 2xx, and the
rollup still has `cellValueType: number`, a three-decimal number format and
the ring. Either shape fails the checkpoint.

## What the checkpoint asserts

The conversion answers 2xx from v2, and the rollup then holds dates:
`cellValueType` is `dateTime`, its formatting is a date format, and the ring
display — meaningless for a date — is gone.

## What the fixture has to hold

The rollup starts as a number with a three-decimal format and a ring, and
the runner checks that before converting, so "the options were reset" is
observable.
