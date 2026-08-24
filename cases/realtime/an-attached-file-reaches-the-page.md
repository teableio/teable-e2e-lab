# realtime/an-attached-file-reaches-the-page

**T3810** — fixed.

## What the user sees

Somebody attaches a file to a row. On their screen it is there and it opens. On
everyone else's, the row shows an attachment that cannot be opened, downloaded
or previewed — the name is there, the thumbnail is blank — until they reload.

"I uploaded it" and "there is nothing there" are both true at the same time,
which is the kind of disagreement that costs a phone call rather than a bug
report.

## Why

An attachment's address is not stored with the file: it is temporary and
signed, and worked out for each reader. Whoever uploads gets one in the answer
to their own upload. The message pushed to everyone else carried the file
without it.

## The observation is the subscription

Reading the row over HTTP works out an address on the spot and shows nothing
wrong. The case holds the record document the grid subscribes to, and records
the HTTP read afterwards as a diagnostic so the two are visible side by side.

## What the checkpoint asserts

Every attachment the page ends up holding has an address. Not "an attachment
arrived" — the failure is precisely an attachment arriving without one.
