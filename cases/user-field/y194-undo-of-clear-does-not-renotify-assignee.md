# user-field/y194-undo-of-clear-does-not-renotify-assignee

**T6663** — fixed. On the `user-field-notify-replay` runner; the shared design
is described in `user-field/y193-undo-of-delete-does-not-renotify-assignee`, which
is also this case's sibling.

## This variant

Clear the user cell, then undo. The replay writes the same person back through
the _update_ handler rather than the create handler — a different projection,
and the reason the two undo cases are not one.

The update projection had always filtered on the event's source being a user,
which is exactly what a replayed update reports. So the filter that looked like
it was already doing this job was passing every replay straight through, and it
took the same execution-context check the create side got.

Clearing the cell first is also what makes the check meaningful: the assertion
afterwards is that the row carries the assignee again, so the undo has to have
put something back rather than left something alone.
