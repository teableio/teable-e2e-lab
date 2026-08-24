# table/restore-brings-back-the-links-to-it

**T4324** — **open**: this reproduces on `develop`.

## What the user sees

A table is deleted into the trash and taken back out. The table is there, its
rows are there — and the column on another table that pointed at it is not a
link any more, and the values looked up through it are gone.

Everything looks restored, which is what makes this expensive: the base is used
again on the assumption that the undo worked, and the missing connections are
found later, one report at a time.

## What is measured, and where it stands

| commit                       | the column after the restore              |
| ---------------------------- | ----------------------------------------- |
| `847105ecb` (T4324's parent) | ❌ plain text, the link cell empty        |
| `develop`                    | ❌ the same, after polling for 30 seconds |

Runs 32693759397 and 32694125208. T4324 fixed this for links that **cross
bases**; the same-base case measured here is still open, so the case is
declared open and shows as ⬜ rather than failing the run. If a later build
fixes it, the case turns ⬜ into 💡 and asks for the declaration to be flipped.

Trashing the table turning the column into plain text is deliberate — see
`table/trash-degrades-inbound-link`. What is missing is the other half:
restoring does not turn it back.

## What the checkpoint asserts

Three things after the restore: the column is a link again, its cell holds the
same row it held before, and the value looked up through it reads the same. A
column that came back as a link but empty would be a different failure with the
same appearance.

## What the fixture has to hold

The connection is read before anything is deleted and has to be working —
restoring something that never worked would prove nothing.
