# base-share/copy-a-share-past-a-panel-outside-it

**T3516** — fixed.

## What the user sees

A share that cannot be saved, and nothing to do about it.

Sharing one folder rather than the whole base is how a base is handed over in
part: the customer gets the tables meant for them and nothing else. What sits
outside the folder is not their business — that is the entire point.

A dashboard panel on a table outside the folder broke the copy. The person
receiving the share sees it fail, and the thing that broke it is in a part of
the base they cannot see and were never meant to. The person sharing has no
reason to connect a dashboard on an unrelated table to a customer who cannot
open their share.

## What the checkpoint asserts

The copy is made, it holds only the shared table, and that table carries only
the panel that was inside the shared folder.

The last part is not decoration: exporting the outside panel rather than
skipping it would make the copy succeed while handing over the name of a table
that was deliberately left out.

## What the fixture has to hold

The folder holds only the inside table, and both panels exist before the share
is made. If the outside table were in the folder there would be nothing outside
the shared scope, and the case would be about an ordinary copy.

Saving a share elsewhere is off by default and is turned on, or every save is
refused and the case never reaches its question.
