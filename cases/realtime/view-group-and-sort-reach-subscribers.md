# realtime/view-group-and-sort-reach-subscribers

**Bug:** T6651 — changing a Grid view's group or sort did not take effect until
the browser was reloaded.

## What broke

The write itself was fine. Reading the view back from the server showed the new
grouping persisted, which is what made the report confusing to triage.

An op was published, too. But it only set the document's `query`; it never set
the top-level `group` / `sort` — the shape the HTTP VO uses and the shape
clients read. So the subscriber received a change it could not act on, the grid
kept its old layout, and the only way to see the new one was to reload and
fetch the view fresh.

Group and sort are separate realtime projections. The fix had to add the
missing op component to each, independently.

## Reproduction

1. Create a table with a text field, a number field and three rows; take its
   default view.
2. Subscribe to that view's document as a client would.
3. `PUT /table/{tableId}/view/{viewId}/group` with a group on the text field.
4. `PUT /table/{tableId}/view/{viewId}/sort` with a sort on the number field.

Before the fix, the subscribed document's `group` and `sort` stay undefined —
while `query.group` fills in, which is exactly the shape of the bug. After it,
both appear.

## What the checkpoint asserts

That the subscribed document's top-level `group` appears after step 3, that its
`sort` appears after step 4, and that the client did not error along the way.

**Waiting on `group` rather than on "an op arrived" is the whole point.** An op
did arrive before the fix. A case that only asserted something was published
would have been green on both sides and proved nothing — this is the same trap
as a case that watches the wrong engine, wearing different clothes.

Both properties are checked because they are separate projections: a regression
in one is invisible to a case that only watches the other, which is precisely
why the fix touched two files.

## Why the data looks like this

Three rows with distinct titles and ascending numbers, so a group and a sort
are both meaningful rather than degenerate. Nothing asserts on the values —
what is asserted is that the view's configuration reached the client.

The view starts with neither a group nor a sort, verified before the checkpoint.
The case is about the transition away from "none", and a view that already had
one would not exercise it.

See `realtime/view-filter-update-reaches-subscribers` for the seam this rests on
(`framework/realtime.ts`) and why it connects over SockJS the way a browser
does.
