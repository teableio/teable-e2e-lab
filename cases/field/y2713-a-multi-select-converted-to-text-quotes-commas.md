# field/y2713-a-multi-select-converted-to-text-quotes-commas

**T7836** — fixed in `b912f11fe`.

## What the user sees

After the conversion a row reads `A, B, C`. Converted back, or read by an
import, that is three options — "A", "B" and "C" — where the row had two.

## What the checkpoint asserts

The conversion answers 2xx from v2; the row holding `A` and `B, C` reads
`A, "B, C"`, and the row holding only `A` reads `A`.

## What the fixture has to hold

One option containing a comma next to one without, so quoting has to be
applied to exactly one of them.
