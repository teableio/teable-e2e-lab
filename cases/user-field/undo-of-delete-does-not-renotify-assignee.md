# user-field/undo-of-delete-does-not-renotify-assignee

**T6663** — fixed. On the `user-field-notify-replay` runner; the shared design
is described in `user-field/record-duplicate-does-not-renotify-assignee`.
Sibling of `user-field/undo-of-clear-does-not-renotify-assignee`, which covers
the update handler's half of the same guard.

## This variant

Delete the assigned row, then undo. The undo replays the create, and a replay
re-issues the original request — so the event it publishes still reports its
source as a user. Nothing in the event says otherwise; the only thing that
knows this is a replay is the execution context, which is where the guard reads
it from.

That is why this needed a separate fix from the create-source whitelist, and
why it gets its own case rather than sharing one with the duplicate.

## The window id

Every mutation here and the undo that replays it carry the same `x-window-id`.
The undo stack is keyed by it: a missing or mismatched id undoes nothing, the
undo answers with a status that is not `fulfilled`, and the runner refuses
rather than sit through a quiet budget watching an action that never happened.
