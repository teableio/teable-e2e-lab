# lookup/y2905-a-multiple-lookup-drops-the-ring

**T7745** — fixed in `34d1cab49`.

## What the user sees

A multi-value lookup carries a ring setting it cannot draw, and every
editor and renderer downstream has to cope with it.

## What the checkpoint asserts

Both lookups, created without a format, inherit the source's currency
format. The single-record lookup keeps the ring; the multiple-record lookup
has no `showAs`.

## What the fixture has to hold

The single-record lookup is the control: inheriting there is right, and a
fix that stripped display options everywhere would fail it.
