# lookup/y249-conditional-lookup-keeps-all-matches

**Y249 sentinel** — fixed.

## What the user sees

A conditional lookup must not omit records that satisfy its condition. This
case keeps the broad report executable by covering one deterministic contract:
two source rows with the same numeric key both appear in the host row.

## What the checkpoint asserts

The lookup returns exactly both matching source values after computation
settles. It does not use the previously recorded manual result as an oracle.

## What the fixture has to hold

The source table contains two rows with the same numeric key and distinct
values. The host table contains one row with that key. Both tables and the
field-reference condition are created through public APIs before the
checkpoint.

The original report did not identify a confirmed cause or a fix commit, so
this is deliberately a narrow sentinel rather than a historical fix claim.
