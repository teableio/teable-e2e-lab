# user-field/y191-import-does-not-notify-assignee

**T6662** — fixed. Sibling of
`user-field/y192-table-duplicate-does-not-notify-assignee`, on the same runner.

## The bug

A user-field notification means one thing: _someone just put you on this_. v1
sent it only for that. v2 sent it for any created record whose user cell
arrived populated — and bulk data movement arrives that way by definition.

Importing a CSV into an existing table is the ordinary way a sheet exported
from somewhere else, already naming people, comes back in. Every row of it
re-delivered its assignment as a fresh notification, plus the email that goes
with it. A few hundred rows is a few hundred of each, for work nobody had just
handed out. The fix reads the create's source and stays silent for `import`
and `tableDuplicate`; user actions and form submissions still notify.

## Why the observation is a second real session

The notification list is scoped to whoever is asking, so the person who was
assigned has to do the asking. The runner signs up a second user, invites them
to the base as an editor, and reads their unread list through the same
endpoint the bell icon calls.

Reading the notification table directly would have been shorter and would have
proved less: what matters is not that a row exists but that it reaches the
person. It would also have had to happen outside the checkpoint, which is the
wrong side of the boundary for the assertion this case is making.

## Why there is a control table

The assertion is silence, and silence is indistinguishable from a notification
pipeline that is not running — a misconfigured mailer, a projection that never
subscribed, a commit where the feature does not exist yet. Either would make
this case pass everywhere and warn about nothing.

So every run first assigns the same person on a throwaway table with a plain
record create, and waits for that notification to arrive. That establishes both
things the quiet budget depends on: notifications work here, and how long they
take here. If the quiet budget is not at least three times the latency actually
measured, the runner refuses to continue rather than report a green it has not
earned.

The control lives on its own table because the two are told apart only by the
table id in the notification's url.

## What the checkpoint asserts

For the whole quiet budget, no notification whose url names the imported-into
table appears in the assignee's unread list. The first one that does is the
bug, and the message carries how long after the request it showed up.

Before that, outside the checkpoint: the imported row is readable and really
does carry the assignee. An import that dropped the user cell would leave
nothing that could notify anyone, and would pass on every commit.

## Budgets

`rowVisibleTimeoutMs` is a different clock from the other two — the import
answers before its rows land, so waiting for the row is not waiting for the
notification. The quiet budget starts when the import request returns, which is
when the notifications it would have produced are scheduled.

## Importing a whole base: built, run, not kept

T6662's title names three paths — CSV import, base import, duplicating a
table. Two of them are this group's cases. The third was written afterwards
and is not here, because it is green on both columns.

The case built its own space, a source base with one assigned row, exported
that base, uploaded the file back through the ordinary attachment path, and
imported it. The imported copy carries the assignment — the fixture check for
that ran and passed, so this is not a case that failed to build its
precondition. Then nothing arrived: 25 seconds of silence on `cd09b156b`, the
fix's parent, against a control notification that took 527ms on the same
commit. Run 32651690581.

So on this path the pre-fix behavior already matches what the issue asks for.
Why is not established here. Reading the issue does not settle it either: the
confidence note marks the two bolded rows — CSV import and table duplicate —
as read line by line, and base import is inside the same bolded entry as CSV
import rather than being its own row. It may be that the two share a heading
in the issue but not a code path.

The work is kept on branch `case/notify-base-import`, unmerged. If the base
import path changes, it is a working fixture already.
