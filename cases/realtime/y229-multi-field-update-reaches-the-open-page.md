# realtime/y229-multi-field-update-reaches-the-open-page

**T4621** — fixed.

## What the user sees

Someone changes several cells of a row at once — a paste across the row, a form
submission, an automation setting a status and a date together. On everyone
else's screen only some of those cells change. The row reads as half-edited,
which is a perfectly normal thing for a row to be, so nobody has a reason to
refresh it. They keep working from values that are no longer true.

## Why

The change went out to the watching clients as one message per cell, and only
some of them survived. The row in the database was right the whole time; the
loss was on the way out.

## Why reading the row afterwards proves nothing

A case that edited the row and then read it back over HTTP would pass on the
broken build. The failure is only visible in what was pushed, so the case holds
an open subscription to the record document — the same one the grid holds — and
asserts against what that client ends up holding.

## What the checkpoint asserts

After a single edit changing every cell, the watching client holds every new
value. Not "at least one changed", and not the row read back from the server:
the subscriber's own copy, in full.

## It has to be a single-record edit

Measured on the pre-fix commit (run 32670313557): the batch-update endpoint
delivered all four cells in 617ms. Batch updates go through a different
projection that already sent the whole row as one message, so a case built on
them is green on the broken build. The case uses the single-record update.

## What the fixture has to hold

Four cells. With two, a lost change and a change applied in a different order
are hard to tell apart; the runner refuses fewer than three.

Every cell starts with a value distinct from the one it ends with, and the
runner waits for the subscriber to be holding the starting values before it
makes the edit — otherwise the assertion could be satisfied by a client that
was already showing the answer.
