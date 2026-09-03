# lookup/a-condition-with-a-bracket-in-it

**T7080** — fixed. On the `nested-group-conditional-rollup` runner.

## What the user sees

A column counts, for each customer row, the orders that match it **and** are
either unpaid or flagged for review. The count is too high: it is the number of
orders for that customer, full stop. The bracket had no effect.

Nothing indicates this. The count is a real count of real rows belonging to the
right customer; the column is not marked; reopening it shows the condition
written out in full, bracket included.

## Why

"Either of these, within that" is a group inside a group. The fast path that
answers this kind of column read the outer conditions and dropped nested groups
on the floor, so what ran was the outer match alone.

## What the checkpoint asserts

Two columns are built side by side on the same reference match: one whose
condition has a bracket, one whose condition is flat.

The **flat** one is checked first. It goes through the same fast path and is
correct on both sides of the fix, so if it is wrong the reference match itself is
broken and this case is about something else — the failure says so rather than
reporting the nested-group bug.

The bracketed one is then checked per host row. The failure message carries, for
every host, what was counted, what should have been, and how many rows match the
reference alone — because a count equal to that last number is precisely the
bracket having been dropped, and saying so in the message saves the next reader
the arithmetic.

## Why the fixture is shaped this way

The runner refuses three kinds of fixture, each for a reason it states:

- **no row that matches the reference but falls outside the bracket** — a bracket
  that excludes nothing counts the same rows whether it is applied or dropped,
  and the case would be green on both sides;
- **no host counting anything** — a column stuck on zero would satisfy the
  assertion for the wrong reason;
- **no host whose reference matches nothing** — that row is what says the
  reference match is still being applied at all.

The settle loop waits on the **control** column reaching its answers, not the
bracketed one. Waiting on the column under test would mean waiting for the bug
to go away, which on a pre-fix commit is waiting for the timeout.
