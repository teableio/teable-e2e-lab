# field/y3234-an-overlong-option-name-is-refused

**T4291** — fixed in `0cb596b3a`.

## What the user sees

Someone converts a text column with a very long value to a select; the
value becomes an option, and the select column then misbehaves in places far
from the conversion.

## What the checkpoint asserts

Converting a text column holding a 1001-character value to a single select
answers 400, the error does not repeat the whole value, and the column is
still text holding both of its values.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with a
text column whose two rows hold a 1000-character and a 1001-character value.
Creating a select column with the 1000-character option directly must succeed
first, as the control.
