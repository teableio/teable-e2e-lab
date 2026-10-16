# field/y2699-a-tick-converted-to-a-rating-is-one-star

**T7845** — fixed in `b7f329e48`.

## What the user sees

A done/not-done column turned into a five-star rating shows every done row
as five stars, as if each had been rated top marks.

## What the checkpoint asserts

The conversion answers 2xx from v2; the ticked row reads 1 and the unticked
row stays empty (not 0).

## What the fixture has to hold

A maximum of 5, so the wrong answer (5) and the right one (1) differ, and
an unticked row as the control that must stay empty.
