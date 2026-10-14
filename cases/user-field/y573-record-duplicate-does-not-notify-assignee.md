# user-field/y573-record-duplicate-does-not-notify-assignee

**T7798** — fixed, by
[teable-ee#3929](https://github.com/teableio/teable-ee/pull/3929)
(`8bfe7c580e`, "T7798 Notify copied assignee on v2 record duplicate"). This is
a reversal: the case was written against T6905, which asked for the opposite,
and the confirmed requirement (Q2-15) now says a copy is an ordinary create.

## What the user sees

A copy is a handover, and the person it hands the row to is told.

Copying a row puts a second record on the table carrying the same user cell.
Under T6905 that copy was treated as one more way of moving an existing
assignment — the reasoning that keeps an import and a table duplicate silent
(T6662, `user-field/y191-import-does-not-notify-assignee` and
`user-field/y192-table-duplicate-does-not-notify-assignee`) — and so it stayed
silent. Q2-15 settled the opposite: a copy is an ordinary create, so the
person the copy names in a user field with "notify when selected" is notified,
exactly as if someone had typed their name in. A silent copy is a handover
nobody hears about.

The fix narrows the v2 create projections' whitelist
(`shouldNotifyOnRecordCreate` in
`community/apps/nestjs-backend/src/features/v2/v2-collaborator-notification.service.ts`)
to include `recordDuplicate`, while import, table duplicate and restore stay
silent. The repository test that asserted the old silence was replaced in the
same PR, so this case is the independent check that the new contract holds
through the public API.

## What the checkpoint asserts

The copy's own notification reaches the assignee inside the observation
budget. The url the bell icon follows carries the copied record's id
(`/base/{baseId}/table/{tableId}?recordId={recordId}`), and that id is what the
checkpoint waits for — not merely "something on this table", because the
assignment that set the row up notified too and was banked before the copy.

## What the fixture has to hold

A delivery assertion is only worth something if the pipeline is known to work,
so every run first assigns the same person on a throwaway control table and
waits for that notification to arrive. That establishes the notification path
is alive on this commit and how long it takes here; if the observation budget
is not comfortably longer than the control took, the runner refuses to run
rather than report a result it has not earned. Here the control does double
duty: without it, a broken pipeline would make the checkpoint throw and read
as the bug rather than as an error.

The row really carries the assignee before it is copied — otherwise the copy
would have nothing to notify anyone about, and the case would fail its own
precondition rather than the product's behavior.

The assignment that sets the row up is a real one and does notify. It lands on
the same table the copy is watched on, so it is waited for and banked before
the copy; the checkpoint then looks for the copied record's id specifically.

Assignments to the same person are folded together for a short while, and a
copy made inside that window would have its notification merged into the
assignment's, so the case waits the window out before copying. That wait was
measured under the old assertion — run 32855242590, where copying immediately
was green on both columns because the copy's notification had folded into the
assignment's. The merge is the same fact under either assertion: without the
wait there is no notification that is the copy's own to observe.

## Where the observation comes from

The assignee's own unread list, read as themselves through the endpoint the
bell icon calls. Reading the notification table would prove a row exists; it
would not prove the person is looking at it.

## Why the id and file name still say "does not notify"

Renaming a case changes the identity the comparison table, the tracker sync
and the `case_filter` select on, so this repository only renames to correct a
wrong Y number (`#127`, `#129`). This case is still Y573 — the same test case
the behavior was imported under — so the slug is kept and the direction lives
in the declaration the framework reads: `issue: "T7798"`, `status: "fixed"`,
and the `action` that selects the delivery checkpoint.
