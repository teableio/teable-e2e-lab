# field/turning-off-no-duplicates-clears-a-legacy-index

**T5386** — fixed. On the `unique-toggle-cleanup` runner; its sibling is
`field/turning-off-no-duplicates-lets-a-duplicate-in`, and the shared design is
described there.

## This variant

The same switch, on a table that carries a second unique index over the same
column — a standalone one, named the way an older version named them.

Switching the column's constraint off looked for what the current code would
have written and found nothing else. The older index stayed, and duplicates
went on being refused by something that has no representation in the interface
at all.

## Why the index is written with SQL

The product does not create indexes under the old name any more, so there is no
way to ask for one. This is what a base that has been through an upgrade looks
like, not a state a request can produce.

## What is the same

Everything else: the duplicate has to be refused while the switch is on, the
field's settings have to follow the switch, and the assertion is the row that
would not go in.

The two cases are separate because they are two commits — the current-name
cleanup and the older-name one — and each goes red on its own parent.
