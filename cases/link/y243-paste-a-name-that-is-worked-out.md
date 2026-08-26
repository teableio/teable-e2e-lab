# link/y243-paste-a-name-that-is-worked-out

**T5316** — fixed.

## What the user sees

A table whose first column is worked out rather than typed — an invoice number
built from a prefix and a counter, a full name assembled from two columns.
Pasting one of those names into a link column pointing at that table fails.

That is the most ordinary way to fill a link column in: copy a list of invoice
numbers from somewhere, paste it down the column, let each one find its row. It
failed on exactly the tables whose names are most predictable, which are the
ones people paste into.

## Why

Matching a pasted name against the linked table was only allowed when that
table's first column was plain typed text. A column that works its value out
was refused before any matching happened.

## What the checkpoint asserts

The paste is accepted **and** the link cell holds the row that name belongs to.
A paste that answered successfully and left the cell empty is a different
failure with the same appearance — the name matched nothing.

## What the fixture has to hold

Three rows on the far side, so matching the right one is a choice rather than
the only option. The first column is turned into a worked-out one after the
rows exist, and the runner reads the resulting names back before pasting: if
the column were not producing the name being pasted, every commit would fail
the same way.
