# realtime/manual-sort-reaches-the-open-page

**T6349** — fixed.

## What the user sees

Clicking sort does nothing. The rows stay where they were. Reloading the page
shows the sorted order for a moment and then the old order again.

## Why

Sorting a grid rewrites that view's own row order, and the product does it with
raw SQL for speed. Nothing told the subscribers, so nothing was pushed to the
page that asked for the sort. Separately, the socket's cached answer for that
view kept its pre-sort order, which is what overwrites the correct order a
reload had just rendered.

## The observation is a live query

The grid subscribes to a view's rows as a query, not as a document, and the
failure is precisely that nothing is pushed. A case watching a single document
would have nothing to notice — there is no document whose contents changed.

This case is why the lab's realtime helper grew query subscriptions; the two
existing realtime cases watch view documents.

## What the checkpoint asserts

Both halves of the report. The watching client is pushed the sorted order, and
a plain read of the view afterwards agrees with it. A push that arrived while
the cached answer stayed stale would put page and server back out of step on
the next refresh.

## What the fixture has to hold

Three rows, not two: with two, a sort that reversed them and a sort that did
nothing to a coincidentally-ordered pair are hard to tell apart. And the seeded
order is not already ascending — sorting an already-sorted fixture pushes
nothing and would pass on every commit. The runner refuses both.

The client's starting order is checked before the sort, so the assertion cannot
be satisfied by an order that was there all along.
