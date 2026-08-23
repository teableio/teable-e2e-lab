# formula/find-searches-a-multi-select

**T6157** — fixed.

## What the user sees

A formula that works fine over a text column produces nothing at all when
pointed at a multi-select. Not an error, not a zero — an empty column, with
nothing anywhere to say why.

## Why

`FIND` asks whether one piece of text contains another. A multi-select cell —
or a link cell, which is the same shape underneath — holds several values
rather than one string, and the query built for it asked Postgres to search
inside a jsonb value with a text operator. That fails, and it fails the whole
computed task, which is why the column stays empty rather than showing a
mistake in one row.

## How the case is built

Two rows: one whose tags contain the word, one whose do not.

The second row is what makes the first meaningful. If nothing were supposed to
match, a column of "no" and a column that never computed would look identical —
which is the shape of this bug exactly.

The formula is wrapped in an `IF` so that every row has a word to read. `FIND`
answers a non-match with a zero or a blank depending on the build, and a blank
cannot be told from a cell that never computed.

The selections are read back before the formula is added, so a multi-select
that stored nothing would be caught rather than making every row's answer the
same for a reason that is not the formula.

## Limits

Multi-select only. The same failure applies to link cells — the commit names
both — and nothing here covers that shape.
