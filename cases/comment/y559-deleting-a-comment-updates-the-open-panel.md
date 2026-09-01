# comment/y559-deleting-a-comment-updates-the-open-panel

**T7035 / Y559** - fixed.

## Why this case uses a browser

The delete endpoint already succeeded during the incident. The failure lived
in the open panel's paged cache, which put the deleted comment back into the
visible list. An API-only case would pass before and after the fix.

## Fixture proof

The runner creates a real editor, one record, and two comments owned by that
editor through public APIs, then opens the record with the editor's browser
session and comment panel visible. Before the checkpoint, the panel must show
both texts and count two.

## Checkpoint

The user deletes one comment once. That text must disappear immediately, the
control comment must remain, and the deleted text must stay gone while the
panel's paged cache settles. The visible count must become one, and the API list
must contain only the retained comment. Exactly one DELETE request is allowed,
with no page error or not-found message.
