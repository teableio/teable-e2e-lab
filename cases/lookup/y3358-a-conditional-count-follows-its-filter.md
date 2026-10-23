# lookup/y3358-a-conditional-count-follows-its-filter

**T8023** — fixed in `79d454a16`.

## What the user sees

A dashboard count built on computed fields stops following the data: rows
that start matching are not counted, rows that stop matching stay counted, and
only a newly created copy of the column shows the real number.

Observed before the fix (`9acd56d3e`): when the source node's type moved into
the match, the existing rollup stayed at 0 while a fresh rollup with the same
configuration read 1. The original report saw the other direction - a count
that did not come back down - which the checkpoint covers as its second step.

## What the checkpoint asserts

The source node's type moves into the match and then back out. After each
step the existing rollup and a rollup created fresh on the same data are both
read: 1 after entering, 0 after leaving. When only the fresh one is right, the
existing one was not refreshed - that is the bug; when neither is, the failure
message says the fixture is wrong instead.

## What the fixture has to hold

Three tables as in the report, with generic names: nodes with a type, a
version with the expected source and target types, and events whose source
and target types are multi-value conditional lookups through a join key. A
noise event that never matches keeps the filter honest.
