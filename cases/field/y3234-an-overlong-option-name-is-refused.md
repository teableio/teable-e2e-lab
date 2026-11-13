# field/y3234-an-overlong-option-name-is-refused

**T4291** — fixed in `0cb596b3a`.

## What the user sees

An option with a very long name is accepted, and the select column then misbehaves in places far from where it was created.

## What the checkpoint asserts

Creating a single-select column whose option name is 1001 characters answers 400, the error does not repeat the whole name, and no such column exists.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards. A column whose option name is exactly 1000 characters must be created first, as the control.
