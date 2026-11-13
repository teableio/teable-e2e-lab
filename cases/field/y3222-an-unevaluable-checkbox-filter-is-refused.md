# field/y3222-an-unevaluable-checkbox-filter-is-refused

**T8318** — fixed in `a4b375c8d`.

## What the user sees

Someone saves a rollup filtered on a checkbox; the save succeeds, but the column never fills in and no error explains why.

## What the checkpoint asserts

Creating a counting rollup filtered by checkbox `isNot` checked answers a 4xx, and no field with that name exists afterwards.

## What the fixture has to hold

Two tables created for the run in the seed base and dropped afterwards: children with a checkbox (one checked, one not) and a host row linked to both. A control rollup filtered by checkbox `is` checked must be accepted first.
