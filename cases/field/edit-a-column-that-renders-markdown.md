# field/edit-a-column-that-renders-markdown

**T6956** — fixed.

## What the user sees

Notes that were laid out with headings and lists, suddenly full of asterisks
and hashes.

Rendering as Markdown is why the column is a long-text column in the first
place, and it is chosen once and then forgotten about. Editing something else
on that column — its name, its description — is not a decision to go back to
plain text.

The field editor works by reading the column, showing what it reads, and
sending all of it back when the person saves. What it read did not mention
Markdown, so what it sent back did not either, and the setting was gone.

## What the checkpoint asserts

After the edit the column still renders as Markdown, and the edit itself took —
so "nothing was saved" stays a different report.

## Why the case sends back what it was given

It reads the column and submits exactly that, rather than a body it composed,
because that is what the editor does and it is the whole failure: a description
that leaves something out becomes an edit that removes it.

## What the fixture has to hold

The column was made rendering as Markdown. A column that never carried the
setting could not lose it.
