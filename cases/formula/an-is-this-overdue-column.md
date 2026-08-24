# formula/an-is-this-overdue-column

**T6925** — fixed.

## What the user sees

An "overdue" column that is simply blank. Not an error in the column, not a
warning anywhere — no values.

A blank overdue column reads as _nothing is overdue_, and that is the answer
people act on: nobody chases what the column says is fine. The formula itself
is the most-copied one there is, so the column is likely to exist in several
bases before anyone notices.

## Why

The formula mixes a time comparison with a yes/no answer. The comparison was
compiled as though the timestamps were text, which the database refuses
outright, and the refusal happened while the column was being filled in.

## What the checkpoint asserts

Every row has an answer, polled until the column settles. The rows are seconds
old, so the expected answer is "not overdue" for all of them — what is being
measured is that there is an answer at all.

## What the fixture has to hold

The rows are created **before** the column, so the values come from the pass
that fills a new column in over rows that already exist — the pass that was
dying.
