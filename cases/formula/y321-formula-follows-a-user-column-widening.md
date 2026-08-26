# formula/y321-formula-follows-a-user-column-widening

**T4865** — fixed.

## What the user sees

A member column is widened from one person to several — a task that had one
owner now has two, an approval that needed one signature now needs a pair. The
column changes shape: it starts holding a list.

A formula reading that column goes on producing what it produced for one
person — measured on the fix's parent, it produces the characters `["test"]`
as a piece of text rather than a list of one name. So the column says two owners and the column derived from it says one,
and everything downstream — an export, a filter, a message built from the
formula — keeps working with the wrong shape and never says so.

## What the checkpoint asserts

After the change the formula holds a list of one, holding the same value it
held before. Not just "it changed": the value has to survive as well, because a
formula that emptied itself would also stop matching the old shape.

## What the fixture has to hold

The row is written **before** the change. Rows written afterwards are written
into the new shape and would not show the difference.

The formula is read before the change and has to produce a single value. If it
produced nothing, a list of nothing afterwards would prove nothing.
