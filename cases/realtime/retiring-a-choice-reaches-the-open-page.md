# realtime/retiring-a-choice-reaches-the-open-page

**T5102** — fixed.

## What the user sees

A choice is retired from a status column — a status that no longer applies, a
category merged into another. The rows that held it are supposed to empty out,
and on every screen already open they do not.

Those rows go on showing a status the column no longer offers. It cannot be
filtered for, because the choice is gone from the filter list, and it cannot be
chosen again. The row reads as having a status that does not exist, until
someone reloads the page.

## The observation is the subscription

Reading the rows over HTTP after the change shows the cleared cell and proves
nothing — the stored value was cleared correctly. What was missing is the
message telling the open pages about it, so the case holds the record documents
the grid subscribes to.

## What the checkpoint asserts

The row that held the retired choice goes empty for the watcher, **and** the
row holding the surviving choice still shows it. A change that cleared the
whole column would be worse than one that cleared nothing.

## What the fixture has to hold

Both watchers are checked to be holding their row's status before the choice is
retired. Otherwise the assertion could be satisfied by a client that never had
the value.
