# field/turning-off-no-duplicates-lets-a-duplicate-in

**T5386** — fixed.

## What the user sees

A column is set to allow duplicates, and it goes on refusing them. The field's
settings say one thing and the table does another, and the error names a
constraint that does not appear anywhere in the interface.

## Why

"No duplicates" is a switch, and switches go both ways. Turning it on builds
something in the database to enforce it. Turning it off has to take that away —
and it did not.

## How the case is built

A column that refuses duplicates, one row in it, and a second write of the same
value that has to be **refused** — that is the fixture check, outside the
checkpoint. A column that never refused a duplicate would accept one afterwards
for reasons of its own, and the case would prove nothing.

Then the switch is turned off, and the field's own settings are checked to have
followed. They always did: the settings were never the problem, so a case
watching them would be green on the broken build.

## What the checkpoint asserts

The second write of the duplicate lands. That is the row that would not go in,
and it is the whole of what a person experiences.
