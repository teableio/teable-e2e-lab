# realtime/y328-a-duplicated-column-reaches-the-open-page

**T3604** — fixed.

## What the user sees

Duplicating a column is how a column gets reshaped safely: make a copy, change
the copy, delete the original. The copy appears for whoever made it — and for
nobody else, until they reload.

The cost is not the reload. It is that the person who made the copy sees it and
their colleague does not, so two people describing the same table describe
different tables, and the colleague's next edit is made against a table that is
missing a column.

## The observation is the subscription

The case holds the list of columns the page subscribes to. A read over HTTP
would fetch the copy from the database and show nothing wrong — the column was
created correctly; what was missing is the announcement.

## What the fixture has to hold

The page is checked to be holding the original column before the copy is made,
so the assertion cannot be satisfied by a client that was never connected.
