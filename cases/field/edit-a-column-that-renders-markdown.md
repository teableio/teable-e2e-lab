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

1. Asked about the column it just made, the product says it renders as
   Markdown.
2. After the edit it still does, and the edit itself took — so "nothing was
   saved" stays a different report.

The first is inside the checkpoint on purpose. Leaving the setting out of the
column's own description is the first half of the failure: the editor draws
what it is told, so the setting is already absent from the screen before anyone
saves anything. Checking it as a fixture would report the bug as a broken case.

## Why the case sends back what it was given

It reads the column and submits exactly that, rather than a body it composed,
because that is what the editor does and it is the whole failure: a description
that leaves something out becomes an edit that removes it.

## What the fixture has to hold

The request to make the column was accepted and produced a long-text column.
What the product _says_ about that column is not checked here — see above.
