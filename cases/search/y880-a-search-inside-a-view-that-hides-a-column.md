# search/y880-a-search-inside-a-view-that-hides-a-column

**T7268** — fixed.

## What the user sees

A view with one of its two columns hidden. Searching inside that view for a word
that only appears in the hidden column returns rows — rows whose reason for
matching is not on screen. It reads as the search matching at random.

## What was measured

Pending: to be filled in from the matrix run on `b6b57761`, the fix's parent
`375e14ef2`, and `develop`.

## Why the request shape is the whole point

A grid does not ask the server to "use the view". It reads the view's filter and
sort, inlines them into the request, and sets `ignoreViewQuery` so the server
does not apply them twice. That flag was read as "there is no view here at all",
so field-level visibility stopped being applied — even though the view id was in
the request the whole time.

Two shapes, because the grid sends both: one naming the columns it draws, and
one naming none, which is the id-only read behind the rows a grid asks for. They
reached the same fallback by different paths.

## How the case is built

Two rows, two columns, the second hidden through the view's own column
metadata. The searched word is in the hidden column only — the runner refuses a
term that also appears in the visible one, because then the correct answer would
not be empty.

Before the checkpoint the case confirms the view really describes the column as
hidden, and that a search of the whole table does find the row. Without both, an
empty result would mean the search found nothing rather than the hiding being
applied.

## What the checkpoint asserts

Both request shapes return no rows, and a control search for a word in the
visible column still returns its row. The control is what separates "scoped to
the view" from "stopped searching".

## Not the same as y572

`search/y572-how-many-results-with-a-column-hidden` is about the count next to
the search box disagreeing with the list, on a request that narrows by
projection. This one is about a column hidden in the view itself, and what
comes back rather than how many.
