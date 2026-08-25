# user-field/record-duplicate-does-not-notify-assignee

**T6905** — fixed.

## What the user sees

Their bell ringing for work they already had.

A user-field notification means "someone just put you on this". Copying a row
does not put anyone on anything: the copy carries a user cell that was already
filled in, and no one made a new assignment. The person was told again anyway —
so duplicating a handful of rows by hand rings someone's bell once per row.

The bulk paths were fixed first. Copying one row kept sending, and that is the
version a person meets by hand rather than through an import.

## What the checkpoint asserts

Nothing lands in the assignee's notification list in the quiet window after the
copy.

## What the fixture has to hold

Silence has to be silence rather than slowness, so every run first assigns the
same person on a throwaway control table and waits for that notification to
arrive. That establishes the notification path is alive on this commit and how
long it takes here; if the quiet budget is not comfortably longer than the
control took, the case refuses to run rather than report a green it has not
earned.

The row really carries the assignee before it is copied — otherwise "nobody was
notified" could just as well mean "nobody was assigned".

The assignment that sets the row up is a real one and does notify, and it lands
on the same table the copy is watched on. The case waits for it and banks it
before copying, so the copy is not blamed for it. Waiting also proves the
notification path reaches this table and not only the control one.

## Where the observation comes from

The assignee's own unread list, read as themselves through the endpoint the
bell icon calls. Reading the table would prove the row exists; it would not
prove the person is looking at it.
