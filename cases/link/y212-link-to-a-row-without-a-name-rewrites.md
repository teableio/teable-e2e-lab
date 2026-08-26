# link/y212-link-to-a-row-without-a-name-rewrites

**T6508** — fixed. On the `link-cell-shape` runner; the shared design is
described in `link/y210-single-link-accepts-a-one-entry-array`.

## This variant

A link pointing at a row whose primary cell is empty. There is no title to
carry, so the stored link snapshot is `{id, title: null}` — written by the
product, in the ordinary course of linking to a row somebody has not named yet.

Write validation rejected the null title. So the cell could be created and then
not rewritten: reselecting the same row, an import touching that column, an
automation writing it back — all 400, on a value the product itself had stored.

The fixture creates the foreign row with an empty primary cell and sends the
snapshot back the way a reselect sends it. The assertion is the same as its
siblings': the write lands and the cell holds the linked row.
