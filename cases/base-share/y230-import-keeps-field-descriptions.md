# base-share/y230-import-keeps-field-descriptions

**T6522** — fixed.

## What the user sees

A base is exported and imported somewhere else — onto another instance, into a
customer's space, out of a template. Every table is there, every column, every
row. What is gone is the description on each field: the instruction whoever
fills the row reads.

Nothing about the copy looks incomplete, and the descriptions sit one hover
away from where anyone would check. The cost arrives later, as rows filled in
wrong by people who had no way to know the rule.

## Why

The import rehydrated each field without carrying its description across.

## What the checkpoint asserts

Two descriptions survive the round trip with their exact text, and the field
that had none did not acquire one. Asserting only the first would pass on an
import that gave every field the same description; asserting only the second
would pass on an import that dropped them all.

## What the fixture has to hold

The descriptions are read back off the source base before the export. Without
that, a field creation that silently dropped them would look exactly like an
import that did — and every commit would answer the same way.

The case works in its own space, because importing a base creates one and the
seed base's space is shared with every other case in the run.
