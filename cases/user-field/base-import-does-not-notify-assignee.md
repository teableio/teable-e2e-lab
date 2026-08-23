# user-field/base-import-does-not-notify-assignee

**T6662** — fixed. On its own runner, `user-field-notify-base-import`; the
shared design of the notification cases is described in
`user-field/import-does-not-notify-assignee`.

## What the user sees

Someone imports a base. Everyone named in a member field anywhere in that
file gets a notification and an email for every row they appear on — for work
that was assigned to them long ago, in the base the file came out of.

## Why this case exists separately

T6662's title names three paths: CSV import, base import, and duplicating a
table. Two of them shipped as cases when the group was written; base import was
listed as uncovered because it needs a whole export/import round trip rather
than a single request. This is that case.

It is also the largest of the three by a wide margin. A CSV import moves one
sheet into one table; an import rebuilds every table in the file, so every user
cell in the whole base arrives populated at once.

## How the case is built

Its own space, because importing a base creates one there, and the seed base's
space is shared with every other case in a run.

A source base with one table, a member field with notifications on, and one row
assigning a second real person — a genuine signup with their own session, so
the observation is the notification endpoint the bell icon calls rather than a
row read out of the database.

That first assignment is also the control. It is a real assignment nobody
disputes should notify, so waiting for it establishes two things on whichever
commit is running: that user-field notifications work here at all, and how long
one takes. The quiet budget after the import is refused unless it clears the
measured latency by at least three times — otherwise "nothing arrived" would
only mean "not yet".

Then the base is exported, the file is uploaded back through the ordinary
attachment path, and imported into the same space. The imported copy is checked
for the assignment before the quiet period starts: without that, "nobody was
notified" could just as well mean "nobody was assigned", which every commit
would pass.

## Limits

One assigned row, not a few hundred. The case proves the path stays silent, not
that volume is handled — a fix that suppressed the first notification and sent
the rest would pass here.

Nothing here checks email. The notification list is the observation, and the
mail that follows it is out of this repository's reach.
