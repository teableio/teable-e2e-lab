# selection/pasted-link-keeps-its-name

**T6106** — fixed.

## What the user sees

Copying a link cell down a column is how a link gets filled in for a batch of
rows. On the screen of whoever pasted, it looks right. On everyone else's, the
pasted cells read "Untitled" — the right record, with nothing to call it by —
until they reload the page.

The cost is not the pasted row. It is that two people looking at the same table
disagree about it, and only one of them has any reason to doubt what they see.

## Why

The clipboard carries the linked record's id and its name. The paste kept the
id and dropped the name, so what went out to the subscribers had nothing to
display.

## The observation is the subscription

Reading the row over HTTP after the paste fills the name in from the database
and shows nothing wrong. The case holds the record document the grid
subscribes to and asserts against what that client ends up holding.

## What the fixture has to hold

The watching client is checked to be holding the row with the link cell still
empty before the paste. Otherwise the assertion could be satisfied by a client
that already had the answer.
