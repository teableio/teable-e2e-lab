# user-field/y2766-an-api-member-column-stays-quiet

**T7864** — fixed in `a60a3fac1`.

## What the user sees

A script fills a new member column and every person it names gets a
notification per row — from a column whose notify switch nobody touched.

## What the checkpoint asserts

The column, created without `shouldNotify`, does not store it as true, and
after assigning a collaborator and waiting out the quiet window, they have no
notification from this table.

## What the fixture has to hold

A collaborator signed up for the run with no notifications from this table
beforehand, and a quiet window long enough for the delivery the bug made.
