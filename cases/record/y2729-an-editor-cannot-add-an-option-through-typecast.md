# record/y2729-an-editor-cannot-add-an-option-through-typecast

**T7827** — fixed in `5255dd724`.

## What the user sees

Anyone who may edit rows can grow any select's option list, and the list a
team curated to keep reports clean gains whatever was typed.

## What the checkpoint asserts

After the editor's typecast write of `X`, the options are still `A`, `B`
and the cell does not hold `X`.

## What the fixture has to hold

A second person, signed up and invited as an editor for the run, shown to
be able to write an existing option first — so a refusal is about adding an
option, not about access. The fix shipped before this case was added; see
CONTRIBUTING.md on permission bugs.
