# formula/a-column-name-with-a-quotation-mark

**T5480** — fixed.

## What the user sees

Worked-out columns that do not compute, over a table where the only unusual
thing is a column name.

A column name is a label a person writes, so it contains whatever they type: a
size in inches, a quoted phrase, a product name with a quote in it. Nothing in
the interface suggests some characters are unavailable.

The name is carried into the database as an identifier, and an identifier with
a quotation mark in it has to be escaped or it ends early. Unescaped, the query
that fills the worked-out columns in is not the query anybody meant.

## What the checkpoint asserts

Two worked-out columns compute to their expected values: one reading the
quoted-name column directly, and one reading that column instead of the table.

Two rather than one because the reference is written in two places, and one of
them alone would leave half the escaping unexercised.

## What the fixture has to hold

The column kept the name with the quotation mark in it, and the row carries its
value. A product that silently renamed the column would leave nothing to
escape, and the case would be green for a reason that has nothing to do with
the fix.
