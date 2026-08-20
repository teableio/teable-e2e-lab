# user-field/paste-non-collaborator-value

**Bug:** T6661 — copying a member-field cell and pasting it one row down
answered `400 User(usr...) not found in table` when that member is not a
collaborator.

## What broke

Write-path user resolution was narrowed to the base's collaborators. The read
path was left unscoped. So the same table displayed a person it refused to let
anyone write: the column already showed them in the rows above, copying that
cell and pasting it into the next row failed, and the fill handle failed the
same way.

The values were not exotic. v2 had accepted unscoped writes for a while, and
bases collected members who were never collaborators — or who stopped being
one. Narrowing the write path surfaced all of them at once, as cells that
display fine and cannot be copied.

What the fix restores is a distinction about **where the pasted value came
from**:

- A structured user object copied out of a user field is not a typecast. The
  member is already identified; existing on the platform is enough, and no
  collaborator scoping applies.
- Free text is a typecast. It is matched against collaborators only, and text
  matching nobody clears the cell the way v1 did — it does not fail the
  request.

This case covers the first branch, which is the one users hit by copying.

## Reproduction

1. Insert a user row that is **not** a collaborator of the base (SQL — see
   below).
2. Create a table with a text field and a single-value user field, plus one
   row with the user cell empty.
3. `PATCH /table/{tableId}/selection/paste` into the user cell, with
   `content` holding the structured user object and `header` naming the source
   column as the user field.

Before the fix that answers 400. After it, the paste lands and the cell holds
the member.

## What the checkpoint asserts

That the paste answered 2xx **and** that the cell reads back as the pasted
member. Both, because a 2xx that wrote nothing is the same loss with a
friendlier status.

Fixture verification, outside the checkpoint: the cell is empty beforehand, so
"the outsider landed" cannot be satisfied by something that was already there.

The paste goes out through raw `axios` with `validateStatus` open. The
generated client raises `HttpError` on non-2xx and drops the response with its
routing headers, and pre-fix this request is exactly a non-2xx — so it is the
only way to assert `x-teable-v2-feature: paste` on the call under test.

## Why the data looks like this

The outsider is inserted with SQL because the product cannot produce one on
request: every user the API will attach to this base is, by construction, a
collaborator of it. This is the `fixture-db` shape — the state comes from a
window in the product's history, and the observation goes through the endpoint
the grid itself calls.

Their id and email are derived from the runId rather than fixed. This row is
real platform state rather than table data, so a leftover from an earlier run
must never be what a later one reads; the row is deleted again on the way out.

`header` carries the user field's own descriptor. That is what marks the source
as a user column, and therefore which of the two branches above the write path
takes — a paste of the same content without it is a different case.
