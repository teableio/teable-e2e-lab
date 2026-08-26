# user-field/y196-group-folds-drifted-snapshots

**T6626** — fixed. The lead case of three on the `user-group-identity` runner;
the other two are `user-field/y197-group-keeps-legacy-id-out-of-empty` and
`user-field/y198-group-keeps-unwrapped-cell-out-of-empty`, and the shared design is
described here.

## What the user sees

Group a table by a member field. One collaborator appears as two or three group
headers with the same name, their rows divided between the copies. Which copy a
row lands in depends on when that cell was last written.

## Why

A user cell does not store a reference to a person. It stores a snapshot of
them taken when the cell was written — id, title, email, avatar URL — so a
collaborator who changes their email, or gains an avatar, leaves behind a
different stored value on every row written after the change. Grouping on the
raw stored column therefore groups on _when the row was written_, not on who is
in it.

The grouping has to fold on identity instead: the id and the title, the two
keys that do not drift. Everything downstream follows from that, and so do the
other two cases in this group — every cell shape the identity cannot be read
out of becomes a collaborator quietly filed under "empty".

## How the case is built

Three rows, one collaborator, three stored generations of them. The first is
written through the API, so the ordinary shape in the fixture is genuinely the
one the product produces; the other two are rewritten with a later email. `id`
and `title` never move — a fixture that changed those would be describing three
different people, and one group header would be the wrong answer.

The observation is one grouped record read, the same request the grid makes.
`groupPoints` alternates a header and a row count, so slicing the returned page
by those counts reproduces what the grid draws. That matters beyond
convenience: a fix that gets the buckets right while the record page keeps its
own ordering would look correct in the headers alone, and here it does not.

## What the pre-fix column actually returns

Not three headers. One header for the collaborator, covering one row, followed
by two more row segments that belong to no header at all — measured on
`fb4d62c3c`, run 32586254919. That is the same split seen from outside: the
buckets came apart, and only the first piece kept a header. The grid draws the
rest as extra append rows with the row numbering restarted, which is how the
bug was reported.

So this case declares its pre-fix behavior as header-less row segments rather
than as a partition. There is no partition to compare against; the segments are
the finding, and the runner reports how many rows fell outside every header.

## What the fixture has to declare

Each case declares the buckets it expects and what the pre-fix grouping does
with the same fixture. The broken side is declared rather than derived — what
the old code did with each cell shape is the thing under test, and computing it
here would make the case agree with itself instead of with the product — and it
is copied from the run that first went red rather than reasoned out. Two of the
three declare a partition; this one declares header-less row segments. The
runner refuses a broken partition equal to the expected one, because that case
could not tell the fix from the bug.

Every stored cell is also read back raw before the checkpoint and checked
against the shape the case says it holds. A SQL fixture that silently did not
land would turn the whole partition into a statement about something else.

## Limits

All three cases use the seed user as the collaborator, so they prove that one
person's rows fold correctly — not that two different people stay apart. Two
collaborators would need a second real user; the notification cases show that
is possible, and it is the obvious next case if the identity expression is ever
touched again.
