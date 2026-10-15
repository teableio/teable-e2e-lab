# field/y2854-a-converted-created-time-keeps-its-dates

**T7785** — fixed in `2e8278870`.

## What the user sees

Someone turns "when was this added" into an ordinary column — to pin it
before reorganising, or to correct an import — and every cell in it is
blank afterwards.

## What the checkpoint asserts

For each target type, in its own table:

- the conversion answers 2xx from v2;
- **text**: the row holds exactly the string the column showed before, worked
  out locally from the stored instant in the column's own time zone;
- **date**: the row holds the same instant, and the column now accepts a
  typed date, which a column still behaving as created time would ignore.

## What the fixture has to hold

A time zone far from UTC (Tokyo), so a conversion that formatted in UTC
reads a different hour. One table per target, because a conversion cannot be
taken back to try the other.
