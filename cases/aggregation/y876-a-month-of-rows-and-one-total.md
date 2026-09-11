# aggregation/y876-a-month-of-rows-and-one-total

**T7060** — fixed.

## What the user sees

The same blank as `aggregation/y875-a-day-of-rows-and-one-total`, on a date
column formatted as a month: a month's rows sit under one heading and that
heading prints no total.

## What was measured

The same shape one truncation up: on `2c9ebe653` and on the fix's parent
`764aee642` both headings come back empty against a foot total of 250, keyed by
3 groups instead of 2. On `develop` they read 200 and 50. Run 34559846298.

## Why both units

The fix truncates a date-like group at the unit the column is formatted to, so
a day column and a month column travel the same code at different truncations.
Two weeks apart is a much wider gap than eight hours, and a fault that only
split rows inside a day would leave this one green — carrying both is what says
the unit is not what matters.

## How the case is built

Three rows and a date column formatted as `YYYY-MM` in `Asia/Shanghai`: two in
April 2025 two weeks apart, one in May. The headings should total 200 and 50.

The instants are written at 16:00 UTC, which is the next day in `Asia/Shanghai`
— so the fixture also depends on the timezone being applied before the
truncation, not after.

## What the checkpoint asserts

The same as the day case: every heading the list shows gets a total, and the
totals are of the rows under them, with the foot total checked separately
first.

## Limits

One statistic (sum) and one timezone, as with the day shape.
