# record/y2961-write-a-click-count-through-the-api

**T7733** — fixed in `fdea29bbe`.

## What the user sees

An integration restoring or presetting click counts is told every write
succeeded, and every count stays where it was.

## What the checkpoint asserts

The record PATCH answers 2xx from v2 and the row then reads
`{"count": 3}`.

## What the fixture has to hold

A fresh row with no count, checked before the write, and a count of 3, so
it cannot be mistaken for a single press.
