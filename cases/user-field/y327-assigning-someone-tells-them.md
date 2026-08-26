# user-field/y327-assigning-someone-tells-them

**T3816** — fixed.

## What the user sees

Nothing. That is the failure: somebody puts their name in a row and they are
never told.

Being told is the whole point of a member column — it is how work is handed
over in a base, and what people use instead of sending a message. When it stops
working the column still looks right, because the name is sitting in the cell;
the handover just quietly does not happen.

## What the checkpoint asserts

The assignee's own unread list, read through the endpoint the bell icon calls,
contains something about this table within a minute of being assigned.

## Why the assignee is a real second account

The notification has to be read as the person who received it. The case signs a
second user up, invites them to the base, and polls their list — a row in the
database would prove something was written, not that the person can see it.

## Its siblings, which assert the opposite

`user-field/y191-import-does-not-notify-assignee`,
`user-field/y192-table-duplicate-does-not-notify-assignee`,
`user-field/y193-undo-of-delete-does-not-renotify-assignee` and
`user-field/y194-undo-of-clear-does-not-renotify-assignee` all require silence on
paths where nobody is really assigning anyone. Each of them uses an ordinary
assignment's notification as its control, and this case is the one that holds
that half of the rule down by itself.
