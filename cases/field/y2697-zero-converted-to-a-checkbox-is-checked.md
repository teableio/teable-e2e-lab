# field/y2697-zero-converted-to-a-checkbox-is-checked

**T7844** — fixed in `cb38fa722`.

## What the user sees

A column of counts becomes a "has a value" checkbox, and every row that
had recorded 0 comes out unchecked — indistinguishable from the rows that
never had a value.

## What the checkpoint asserts

The conversion answers 2xx from v2, and the rows that held 0, 5 and -1 are
checked while the row that held nothing stays empty.

## What the fixture has to hold

Zero beside a positive and a negative number, so "only positive values
check" and "every non-empty value checks" give different answers, and an
empty row as the control that must stay empty.
