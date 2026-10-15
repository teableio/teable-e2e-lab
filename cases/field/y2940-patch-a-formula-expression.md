# field/y2940-patch-a-formula-expression

**T7755** — fixed in `e642bc4e9`.

## What the user sees

An integration edits formulas with partial updates and is told every edit
succeeded, while every formula keeps computing what it computed before.

## What the checkpoint asserts

The PATCH answers 2xx from v2, and afterwards the field stores the new
expression, produces text, keeps its time zone, has dropped the number format
and ring that no longer apply, and the row reads the new result (`x10`).

## What the fixture has to hold

A numeric formula with a number format, a ring and an explicit time zone,
patched to an expression producing text — so the result type changes and
every option has a defined expected fate: the zone stays, the number display
goes.
