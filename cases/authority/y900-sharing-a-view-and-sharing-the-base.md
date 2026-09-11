# authority/y900-sharing-a-view-and-sharing-the-base

**T6541** — fixed.

## What the user sees

Somebody whose role does not let them publish anything clicks share on a view
and is refused — then clicks share on the table and gets a link to the whole
base.

The refusal on the view is what makes this hard to notice: it says the product
is enforcing something, so nobody goes on to check the other button. The larger
of the two ways to publish is the one that worked.

## What was measured

On the fix's parent `638b5dc8c` the restricted person is refused 403 on the view
and answered **201** on the whole base — the run carries the share id of the
link that now exists. On `develop` both are refused 403. Run 34584635843.

## How the case is built

The authority matrix on a base of its own, a table with a view in it, and a
second signed-in person holding a role. The role leaves the table itself alone:
this case is about publishing, not about reading.

That person joins the space as a Creator, not as an Editor. An Editor is refused
both kinds of share by their base role alone — measured on the fix's parent and
on develop alike (run 34584209084) — which says nothing about what the matrix
decides. The refusal has to be the matrix's to mean anything.

Before the checkpoint that person reads what is in the base and must succeed. A
refusal to publish means something only if they are somebody who belongs there.

## What the checkpoint asserts

Both share attempts are refused — one view, then the whole base — and the error
names which of them went through. Asking both in one checkpoint is the point: a
run then says whether the product is consistent, rather than only whether one
door is shut.

A refusal that is not the expected 403 is reported rather than accepted.

## Limits

Creating a share link only. The same fix also tightens updating and refreshing
an existing link, and stops an edit-link visitor changing share settings,
neither of which is exercised here.
