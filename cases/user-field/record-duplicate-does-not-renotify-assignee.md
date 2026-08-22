# user-field/record-duplicate-does-not-renotify-assignee

**T6663** — fixed. One of four cases on the `user-field-notify-replay` runner;
this file carries the parts they share.

## What changed, and why it needed four cases

T6662 named two paths that must not notify: CSV import and table duplicate.
T6663 turned that inside out. Only _someone is assigning you right now_
notifies — user actions and form submissions — and everything else is silent by
default, including source types nobody has written yet. A list of exceptions
has to be extended every time a new way of moving records appears; a whitelist
does not.

Four paths fell through the old list, and they fail for two different reasons:

- **`recordDuplicate`** and **`trashRestore`** create a record whose user cell
  arrives already filled. The old rule saw a create with a user in it.
- **`undoDelete`** and **`undoClear`** replay the original request, so the
  event they publish still says its source was a user. Nothing in the event
  distinguishes a replay from the real thing; only the execution context does,
  which is where the second guard reads it from.

Two of each, so a fix that repaired one mechanism and not the other cannot go
unnoticed.

## Why re-notification is worse than notification

Every variant here is a _second_ delivery of an assignment the person already
received a notification for. Not a stranger's notification they can dismiss as
noise — the same one again, for an action they were not part of and cannot see.
Restoring a bin of a hundred rows re-announces a hundred assignments that
nobody made.

## How silence is made trustworthy

The record has to be assigned before it can be replayed, so the notification
that first assignment produces is free — and it is the control. Waiting for it
establishes both that notifications work on this commit and how long they take
here; the quiet budget is refused at runtime unless it is at least three times
the latency actually measured.

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
takes it — but only tagged controllers emit the feature header, and the trash
and undo-redo controllers do not. So the assertion is anchored on the assigned
create, which every variant depends on and which is what publishes the event
the projection listens to; each action's own headers are recorded as data.
What proves the action reached the projection is the pre-fix column going red.

## This variant

Duplicate the assigned record. The copy arrives with the user cell already
filled, and the assertion is scoped to the whole table, so a notification for
either row trips it.
