# lookup/repointed-lookup-shows-its-new-target

**T6195** — fixed.

## What the user sees

A column that follows a value from another table is pointed at a different
column there — the one it was following turned out to be the wrong one — and
afterwards it does not show the new column's value.

## Why

A date and a piece of text are stored differently underneath. Repointing the
lookup changed what it follows without migrating the storage it follows it
into, so the column kept the shape the old target needed.

Nothing about the edit warns of this: choosing a different column in a dropdown
is the smallest change the field editor offers.

## How the case is built

A source row holding both a date and a note, a lookup following the date, and
then the same lookup repointed at the note.

The date has to arrive first — checked outside the checkpoint. A lookup that
never resolved would make "it does not show the new target" describe something
else entirely.

## What the checkpoint asserts

That the field now points at the text column, and that the cell reads the text.
The second is what a person sees; the first keeps the case honest if a build
were to refuse the repoint rather than mishandle it.
