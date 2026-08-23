# user-field/write-stays-inside-the-base

**T6640** — fixed.

## What the user sees

A member column is the list of people who work on this base. Typing an email
into one matched it against every account on the whole platform, deleted
accounts included — so anyone with an account anywhere could be written into a
base they have nothing to do with.

Once written, they are displayed to everyone in the base, they appear in the
column's filter and grouping options as though they belonged, and a row of work
is recorded against a person nobody in the base can talk to. The column reads
as a directory of the team and is not one.

## What the checkpoint asserts

That the cell does not end up holding the outsider. Two answers are correct:
refusing the write, and accepting it with the cell left empty the way an email
matching nobody is treated. The case does not insist on which — only that the
outsider is not in the column.

## The control is the other half

The same write naming someone who does belong to this base runs first, outside
the checkpoint, and has to land. Without it, a build that resolved nobody at
all would look exactly like the fix.

## Why the outsider is made with SQL

The product has no way to produce one on request: every account the API can
attach to this base is, by construction, part of it. Real bases collected them
by the path this case takes.

## Its neighbour, which pulls the other way

`user-field/paste-non-collaborator-value` (T6661) asserts that a user cell
already holding a non-collaborator can still be copied and pasted. The two are
not in conflict: a structured user object copied out of a cell names someone
already identified, while an email typed into a cell is matched — and matched
against this base's people.
