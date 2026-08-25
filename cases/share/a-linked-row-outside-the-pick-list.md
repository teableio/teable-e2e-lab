# share/a-linked-row-outside-the-pick-list

**T4864** — fixed.

## What the user sees

A shared page where a linked record is simply blank.

Narrowing a link column to one view is how a base keeps people picking from the
right list: only current suppliers, only this year's projects. It is a rule
about what can be chosen from now on.

It was read as a rule about what can be shown. A row linked before the
narrowing — or before the other row dropped out of that view, which happens on
its own as data changes — stopped being displayed. The cell is blank and the
count says nothing is linked, while the link is right there in the data.

The shared page is where this hurts most: the person looking at it cannot open
the base, cannot check the underlying data, and has no way to tell an empty
cell from a cell they are not being shown.

## What the checkpoint asserts

Asked through the share what that cell has linked, the product names the linked
row, and the count beside it says one.

Both, because the blank cell is what a person sees and the count saying nothing
is linked is what makes them believe it.

## Which door the case knocks at

The same question asked through the ordinary record endpoint is red on both
columns — measured, run 32901128869. The fix skips the view scope in the share
read paths, so the shared page is where the difference lives.

## What the fixture has to hold

The link is in the data before the checkpoint looks. If the write had been
refused there would be nothing to display, and the checkpoint would be watching
an empty cell.

The view really keeps one row and drops the other, so "outside the pick list"
means something.
