# formula/y556-how-long-ago-in-days

**T1970** — fixed.

## What the user sees

A six-figure number where they expected a small one.

"How many days since we heard from them", "how old is this ticket" — the unit
_is_ the question. Nobody asks how long ago something was and means seconds.
Naming a unit is how a person gets a number they can read at a glance and
compare against a policy: chase after 30 days, escalate after 90.

The unit was ignored and every answer came back in seconds. It does not look
like a unit mistake; it looks like a column that has stopped making sense, and
any rule written against it fires on everything or nothing.

## What the checkpoint asserts

Asked in days, the column answers the number of days since the date — and the
same date asked in hours answers twenty-four times that.

The second is what tells "the unit was applied" from "the number happens to
look plausible", and it holds whatever today's date is.

## What the fixture has to hold

The date landed and both columns answered something. A blank answer says
nothing about units.

The date is well in the past — too close to today and days cannot be told from
hours. The runner refuses a date nearer than the configured minimum.

## Why the comparisons are loose

The answer moves with today's date, so both are compared with a tolerance. The
failure this guards is off by a factor of tens of thousands, which no tolerance
of a day or two can hide.
