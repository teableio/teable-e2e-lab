# link/y3420-a-viewer-cannot-add-a-column-through-a-two-way-link

**T8130** — fixed in `909b7b46a` (in production since build
`release.2026-10-30T02-25-28Z.3658`).

## What the user sees

The owner of a base shares it read-only; someone who can edit a different
base links to it with a two-way link, and a new column appears in the owner's
table that nobody with edit rights added.

## What the checkpoint asserts

As a person who is Creator in the source base and Viewer in the foreign base,
creating a two-way link into the foreign table answers 403, and the foreign
table's columns are exactly what they were before.

## What the fixture has to hold

A space created for the run (and deleted afterwards) with two bases, one
table each, and a person signed up for the run who is Creator in one base and
Viewer in the other. Before the checkpoint that person creates a one-way link
to the same table, which must succeed and leave the foreign table unchanged,
so a fix that refused every cross-base link does not pass.
