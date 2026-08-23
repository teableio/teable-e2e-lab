# import/headerless-sheet-imports-every-line

**T5412** — fixed.

## What the user sees

An import that says it worked, into a table that looks full, missing the first
row of the file.

One row out of a hundred is the kind of loss nobody counts. It is found later,
if at all, by someone looking for a particular record.

## Why

A sheet does not always carry a header — an export from another system, a paste
into a text file, a log somebody saved. The first line is a record like any
other, and the import dialog has a switch that says so.

With that switch off, the first line was dropped anyway.

## How the case is built

Three lines, no header, imported with the switch set to treat every line as a
record.

At least two lines are required: with one, a dropped first line and an import
that did nothing look the same.

## What the checkpoint asserts

Every line landed, **and** the table holds exactly as many rows as the sheet
had lines. The second half catches the opposite mistake — a build that read the
header switch backwards and inserted something extra — and the failure message
names the first line specifically when it is the one that is missing, because
that is the signature of this bug rather than of a broken import.
