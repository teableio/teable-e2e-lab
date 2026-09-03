# field/y326-a-date-column-in-an-aliased-timezone

**T3510** — fixed.

## What the user sees

A date column cannot be created. The message is about the time zone — a zone
the person never picked by hand: it came from their browser, their spreadsheet,
or the system exporting to them.

Time zones have more than one name each. `Asia/Calcutta` and `Asia/Kolkata` are
the same zone, as are `America/Buenos_Aires` and
`America/Argentina/Buenos_Aires`. The accepted list held only the current
names, so anything sending an older one was refused outright.

## What the checkpoint asserts

Three things: the column is created, it keeps the zone name it was given, and a
date written into it comes back.

The middle one matters on its own. Quietly rewriting the zone to the current
spelling would send a different name back to whatever reads the field — a
subtler version of the same problem, and one that would pass a case asserting
only that the column exists.
