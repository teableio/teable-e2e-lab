# link/y3638-a-duplicated-reverse-link-keeps-its-children

**T8231** — fixed in `55feac994`.

## What the user sees

Duplicating a parent's "children" column gives an empty column, or editing the copy moves children between parents in the original.

## What the checkpoint asserts

The duplicated reverse column lists the same children per parent as the original, and editing the copy leaves every child pointing at the parent it pointed at.

## What the fixture has to hold

Two tables created for the run in the seed base and dropped afterwards: two parents and four children, three of them linked many-to-one to a parent and one unlinked.
