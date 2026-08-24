# formula/is-this-number-filled-in

**T3303** — fixed.

## What the user sees

A chase list built on "this number has not been filled in yet" comes out empty.
An empty list reads as _nothing to chase_ — so nobody looks again, and the
quotes without a price stay without a price.

The same formula is behind a count of incomplete forms and behind the colour
rule that marks the gaps. All of them agree with each other and all of them are
wrong.

## Why

Comparing a number column against blank did not treat an empty cell as blank,
so those rows answered the same way as the filled ones.

## What the fixture has to hold

Three rows: one with a price, one with nothing, and one priced at **zero**.
Zero is the row that separates "empty" from "falsy" — a formula treating zero
as unfilled would be wrong in the other direction and would pass a fixture
without it.

The runner refuses a fixture that has only one kind of row: a formula answering
the same for everything looks right when there is nothing to compare it with.
