# base-share/y887-a-shared-picker-and-an-email-address

**T5101** — fixed.

## What the user sees

Nothing — which is the point. A shared form is a link anybody can open: no
account, no membership, often posted publicly. Typing a full email address into
the people picker on that form told the person holding the link whether that
address belongs to this organisation, and repeating it address by address told
them who works there.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## How the case is built

A table with a people column, a form view, and a share link on it. The picker
is then searched twice: once by the owner's name, once by the owner's full
email address.

The person searched for is genuinely a collaborator. That matters: an empty
answer then means the address is not being matched, rather than that nobody by
that description exists.

The name search is taken first and outside the checkpoint, as the control. If
the picker cannot find them by name, an empty answer to the email search says
nothing at all about addresses.

## What the checkpoint asserts

Two things, both halves of the same leak: an email search returns nobody, and
the answers the picker does give carry no email addresses.

The second half is also asserted by
`base-share/y429-department-member-appears-in-share-picker`, which is about a
different fix; the searchable-address half is this case's own.

## Limits

One share type (a form view) and one signed-in collaborator. The fix also
covers kanban and plugin shares and the read-only share path, which take the
same search but are not exercised here.
