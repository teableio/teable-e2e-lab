# table/y248-collaborator-leaves-deleted-table

## Source

Y248 tracks T6924, fixed by
[teable-ee PR #3149](https://github.com/teableio/teable-ee/pull/3149)
at commit `9ebd733db`. A collaborator could remain on a table after another
actor deleted it. The open page then kept addressing a resource that no
longer existed and surfaced not-found failures instead of taking the user to
a safe destination.

## Fixture

Setup uses product APIs before the deletion:

1. Create a surviving fallback table with one readable row.
2. Create the target table with one readable row and verify its v2 record
   route.
3. Open the target grid in Chromium and wait until the browser is firmly
   anchored to its table and view.
4. Register page-error and request observers before any actor deletes data.

The browser never invokes the delete action, so it behaves as the passive
collaborator. The API call is the other actor and avoids coupling this case to
the table-delete confirmation UI.

## Checkpoint

`collaborator-recovers-from-deleted-table` deletes the target through the
public API and asserts the expected user-visible recovery:

- the delete answers 200 through the v2 `deleteTable` route;
- the browser leaves the target URL and lands on the surviving table;
- the public table list no longer contains the target and still contains the
  fallback;
- after recovery settles, no new requests address the deleted table; and
- the page raises no unhandled JavaScript errors.

The full-page deep-link behavior is intentionally not duplicated here. This
case protects the realtime recovery of a page that was already open when a
collaborator deleted its table.

## Expected status

`status: fixed`. The checkpoint must reproduce at `9ebd733db^` by leaving the
open collaborator on the deleted table, and pass at `9ebd733db` and later
revisions.
