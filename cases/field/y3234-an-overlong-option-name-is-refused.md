# field/y3234-an-overlong-option-name-is-refused

**T4291** — fixed in `0cb596b3a`.

## What the user sees

Someone pastes a very long value into a select column; it becomes a new
option, and the select column then misbehaves in places far from the paste.

## What the checkpoint asserts

Pasting a 1001-character value into an empty single-select cell answers 400,
the error does not repeat the whole value, no option with that name exists and
the cell stays empty.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with a
single-select column that has no options and two rows. Pasting a value of
exactly 1000 characters into the first row must create that option first, as
the control.
