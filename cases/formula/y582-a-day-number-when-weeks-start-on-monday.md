# formula/y582-a-day-number-when-weeks-start-on-monday

**T1972** — fixed.

## What the user sees

Numbers that are plausible, consistent with each other, and one day out.

Where the week starts is not a preference about wording. Most of the world
works Monday to Sunday, and a column that numbers the days is used to sort and
group by weekday: a rota, a delivery schedule, a weekly report.

The instruction was ignored and every day came back numbered from Sunday.
Everything built on the column is then off by one day, and nothing says so —
the error only shows if someone checks a date they already know the answer for.

## What the checkpoint asserts

Told that weeks start on Monday, the column answers the Monday-based number for
a date whose weekday is known.

The same date is also asked with no instruction and with Sunday. Both answer
the same way on either side of the fix, and they are what makes the Monday
answer readable rather than a number on its own.

## What the fixture has to hold

The date landed on the row. A blank date would make all three columns blank and
say nothing about where the week starts.

The two expected answers differ — for a Tuesday they are 1 and 2 — or ignoring
the instruction would give the right number anyway. The runner refuses a date
where they agree.
