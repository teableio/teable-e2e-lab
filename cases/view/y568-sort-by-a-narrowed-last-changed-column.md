# view/y568-sort-by-a-narrowed-last-changed-column

**T6897** — fixed.

## What the user sees

A table sorted by "last changed" where the row at the top does not show the
latest time — and the times are right there to read.

A "last changed" column can be narrowed to the columns a team actually cares
about: when did this order's status last move, ignoring the notes somebody
tidied up afterwards. Narrowing it is the whole point; the unnarrowed version
answers a question nobody asked.

The narrowing reached the value on screen and not the sort. The column shows
one thing and orders by another.

Nobody suspects the sort. They suspect the timestamps, and there is nothing
wrong with them.

## What the checkpoint asserts

The order the sort returns matches the order of the values that same column is
showing.

Not a time the case worked out — the values the product itself returned. The
question is whether the product agrees with itself.

## What the fixture has to hold

Three rows, so an order that is reversed and an order that is wrong in one
place stay distinguishable.

Three different times on screen, and the newest belonging to the row whose
watched column was touched last — which is what proves the narrowing reached
the displayed value at all. Without it, the sort would have nothing to
contradict.

The last edit in the fixture is to a column the "last changed" column is **not**
watching, on the row whose watched value is oldest. That is what makes "the row
touched most recently" and "the row touched most recently in a way that counts"
different rows.
