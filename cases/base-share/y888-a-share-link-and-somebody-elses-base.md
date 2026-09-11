# base-share/y888-a-share-link-and-somebody-elses-base

**T6185** — fixed.

## What the user sees

Nothing, which is what makes it serious. Somebody holding a link to their own
shared base could read and export a base belonging to anybody else — its
structure through the node list, its contents through the export — by putting
the other base's id in the request while presenting their own link.

No share on the other base, no membership of it, nothing beyond one valid link
of their own.

## What was measured

On the fix's parent `c488c5ed2` the link holder asking for the other base's
node list is answered 200, and the answer lists that base's table by id. On
`develop` the same request is refused with 403, for the node list and for the
export. Run 34567780155.

An earlier run had an empty base as the victim, so the unauthorised answer came
back as `[]` — the same leak, reading like nothing happened (run 34567517303).
The victim base now holds a table, so the answer names something that belongs
to somebody else.

## How the case is built

Two bases. One is shared as a whole and the share is set to allow editing; the
other is never shared with anybody and holds a table with a row in it, so an
unauthorised answer names something rather than coming back empty. The link holder is a freshly signed-up
account, created per run — a shared identity would eventually become a
collaborator somewhere by accident, and a legitimate answer would then read as
the leak.

They ask for their own shared base first, outside the checkpoint. The link has
to work where it is meant to: otherwise a refusal afterwards says nothing about
which base was asked for.

## What the checkpoint asserts

Presenting that link against the other base is refused, for the list of what is
in it and for an export of the whole thing. A refusal that is not the expected
403 is reported rather than accepted — "refused for some other reason" is worth
seeing rather than passing.

## Which engine answers

Recorded, not asserted: these are share and base endpoints rather than the
record path, and the answer this case is about is the same shape whichever
engine produces it.

## Limits

Two of the endpoints the header reaches. The fix also covers the websocket
readonly path, which forwards the same header through the same guard and is not
exercised here.
