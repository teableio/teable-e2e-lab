# formula/y2401-working-days-count-both-ends

**T7779** — fixed in `b930e4884`.

## What the user sees

A Monday-to-Friday task reads four working days instead of five; every
deadline and SLA measured with the formula is a day short.

## What the checkpoint asserts

Every row holds the count of working days with both ends included,
weekends skipped, and a reversed range holds the same count negated. The
expected counts are worked out by the runner from the dates, not copied into
the case.

## What the fixture has to hold

Nine ranges: whole weeks, a single weekday, a single weekend day, a
weekend-only range, ranges ending on and spanning a weekend, and a reversed
range. The runner refuses a set without a reversed and a weekend-only range,
because "add one to everything" would pass without them.
