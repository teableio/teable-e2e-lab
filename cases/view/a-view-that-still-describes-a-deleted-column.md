# view/a-view-that-still-describes-a-deleted-column

**T5457** — fixed.

## What the user sees

Not one thing, and that is what makes it worth guarding.

A view carries a setting per column: how wide it is, whether it is hidden,
where it sits. Columns get deleted, and a base that has been worked in for a
while has views whose settings outlived the column they were about.

Those settings were handed out with the view. Every reader gets a list of
columns that does not match the table's — one entry too many, naming something
nobody can see — and each of them decides for itself what to do with the extra:
the grid, an export, the copy made when the view is duplicated. A description
the product disagrees with itself about is a disagreement every reader
inherits.

## What the checkpoint asserts

The columns the view describes are exactly the columns the table has.

## What the fixture has to hold

The column really is gone from the table. A column still in place would make
the view's mention of it correct.

The leftover setting is written with SQL: deleting a column takes its setting
with it, so no request produces this state, and a view that never had one
cannot show the difference.
