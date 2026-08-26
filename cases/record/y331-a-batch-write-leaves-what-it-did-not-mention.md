# record/y331-a-batch-write-leaves-what-it-did-not-mention

**T2490** — fixed.

## What the user sees

A status column that empties itself overnight, on some rows and not others.

Behind it is an ordinary integration write: several rows in one request, each
carrying only the fields that changed. On the rows where the status was not
among them, the status was cleared. Nothing failed, nothing was reported, and
the sender's log says the write succeeded — so the loss is found days later by
whoever notices the gaps, with no obvious event to tie it to.

## What the checkpoint asserts

Three things from one write: the row whose status was not mentioned keeps it,
that row takes the value the write _did_ mention, and the row whose status was
mentioned takes the new one. The last is the control — without it, a write that
did nothing at all would pass.

## What the fixture has to hold

Both rows start with a status, so clearing something that was never there
cannot be mistaken for the bug.
