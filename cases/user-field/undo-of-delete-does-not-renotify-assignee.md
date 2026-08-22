# user-field/undo-of-delete-does-not-renotify-assignee

**T6663** — fixed. One of three cases on the `user-field-notify-replay` runner;
this file carries the parts they share. Sibling of
`user-field/undo-of-clear-does-not-renotify-assignee`, which covers the update
handler's half of the same guard.

## What changed, and why it needed more than one case

T6662 named two paths that must not notify: CSV import and table duplicate.
T6663 turned that inside out. Only _someone is assigning you right now_
notifies — user actions and form submissions — and everything else is silent by
default, including source types nobody has written yet. A list of exceptions
has to be extended every time a new way of moving records appears; a whitelist
does not.

The paths that fell through the old list fail for two different reasons:

- **`recordDuplicate`** creates a record whose user cell arrives already
  filled. The old rule saw a create with a user in it.
- **`undoDelete`** and **`undoClear`** replay the original request, so the
  event they publish still says its source was a user. Nothing in the event
  distinguishes a replay from the real thing; only the execution context does,
  which is where the second guard reads it from.

The two undo variants go through different projections — create and update —
so a fix that repaired one and not the other cannot pass unnoticed.

## Why re-notification is worse than notification

Every variant here is a _second_ delivery of an assignment the person already
received a notification for. Not a stranger's notification they can dismiss as
noise — the same one again, for an action they were not part of and cannot see.
Undoing a delete of a hundred rows re-announces a hundred assignments that
nobody made.

## How silence is made trustworthy

The record has to be assigned before it can be replayed, so the notification
that first assignment produces is free — and it is the control. Waiting for it
establishes both that notifications work on this commit and how long they take
here; the quiet budget is refused at runtime unless it is at least three times
the latency actually measured. Observed so far: a little over half a second,
against a 25-second budget.

It is then marked read through the endpoint behind the bell icon's "mark all
read", and the runner checks the unread list is actually empty afterwards. That
is what makes "no unread notification" mean _nothing new_ rather than _nothing
ever_ — without it the checkpoint would count the first assignment as if the
replay had sent it.

Observation is the assignee's own unread list, on a real second session.
Reading the notification table would prove a row exists, not that it reached
anyone.

## Routing

`FORCE_V2_ALL` is on for the whole process, so every operation with a v2 path
takes it — but only tagged controllers emit the feature header, and the
undo-redo controller does not. So the assertion is anchored on the assigned
create, which every variant depends on and which is what publishes the event
the projection listens to; each action's own headers are recorded as data.
What proves the action reached the projection is the pre-fix column going red.

## The window id

Every mutation here and the undo that replays it carry the same `x-window-id`.
The undo stack is keyed by it: a missing or mismatched id undoes nothing, the
undo answers with a status that is not `fulfilled`, and the runner refuses
rather than sit through a quiet budget watching an action that never happened.

## A fourth variant that was written and dropped

Restoring a deleted record from the trash was the obvious fourth path, and the
fix touches its handler too. It notifies nobody on the fix's parent either.

The fixture held — the restored row comes back carrying its assignee, so this
is not a case that failed to build its precondition. The restore simply does
not republish the user cell, so there was never a notification for the fix to
stop on this route. A case green on both columns warns about nothing, so it was
not kept. This paragraph is the record; the commit itself is settled by the
three cases that did reproduce, which is why there is no triage-ledger row for
it.

## This variant

Delete the assigned row, then undo. The undo replays the create, and a replay
re-issues the original request — so the event it publishes still reports its
source as a user. That is why this needed a separate fix from the
create-source whitelist.
