# import/y226-headerless-sheet-imports-every-line

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

## Which entry point

The one that creates the table as it goes — that is the handler the fix
changes. Adding the same lines to a table that already exists keeps the first
line on the fix's parent (run 32667570622), so the runner keeps that shape as a
config value.

## How the case is built

Three lines, no header, imported with the switch set to treat every line as a
record. The check is on the values each row carries rather than on which column
carries them: a table the import builds names its own columns.

At least two lines are required: with one, a dropped first line and an import
that did nothing look the same.

## What the checkpoint asserts

Every line landed, **and** the table holds exactly as many rows as the sheet
had lines. The second half catches the opposite mistake — a build that read the
header switch backwards and inserted something extra — and the failure message
names the first line specifically when it is the one that is missing, because
that is the signature of this bug rather than of a broken import.
