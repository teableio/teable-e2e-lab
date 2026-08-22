# user-field/trash-restore-does-not-renotify-assignee

**T6663** — diagnostic run only, on `diag/restore-notification-silence`. Not
for `main`.

This is T6663's headline ask: restoring a record from the trash must not
notify. The lab measures no notification on the fix's parent either, so the
case is green on both columns and cannot ship.

The reason is what this run is for. Reading the code says it should notify:
before the fix the restore published its batch-created event with no source at
all, which defaults to `user`, and the event does carry the field values. The
measurement and the code disagree.

After the checkpoint returns — outside it again, so the database is reachable —
the runner reads two things:

- the raw user-field cell of the restored row, and its type. The notification
  extractor wants an object with a string `id`; a trash snapshot may not store
  it in that shape, and if it does not, the whole chain fails silently.
- whether a notification row exists for this table at all. That separates
  "never created" from "created but the unread-list read did not see it".

Whichever way it comes out, the answer belongs in the shared case doc and in
the two issues currently waiting on it, not in a shipped case.
