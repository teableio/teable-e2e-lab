# user-field/trash-restore-does-not-renotify-assignee

**T6663** — fixed. On the `user-field-notify-replay` runner; the shared design
— the control assignment, marking it read, the quiet budget, the routing
anchor — is described in
`user-field/record-duplicate-does-not-renotify-assignee`.

## This variant

Delete the assigned row, wait for it to reach the trash, restore it. The
restore re-creates the record with its user cell intact, which the old rule
read as a fresh assignment: undoing an accidental delete of a hundred rows
re-announced a hundred assignments nobody had just made.

The trash entry is waited for rather than assumed — it is written after the
delete answers, and restoring an id that is not there yet would fail for a
reason that has nothing to do with this bug.

The restore itself is the one action on this runner whose response cannot be
asserted on: the trash controller carries no v2 feature tag. Its headers are
recorded, and the pre-fix red column is what establishes the path was live.
