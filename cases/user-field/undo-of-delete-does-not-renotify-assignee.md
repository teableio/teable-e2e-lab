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

## What this group does and does not answer

The issue behind it asks for two things: restoring a record from the trash, and
undoing a delete, should not notify. It is a Feature request, not a bug report
— the behavior was the same on both engines and the ask is a product change.

The PR that answered it did more than that. It replaced the list of paths that
must stay quiet with a whitelist, and it added a window that coalesces bursts.
Two cases in this group cover that additional scope rather than the issue text:
this runner's `undoClear` variant (the issue says _delete_, not _clear the
assignee_), and `user-field/assignment-burst-arrives-coalesced`. Both are
tracked under the same issue because that is where the change came from, and
both go red on its parent, so they are guarding something real.

## Two variants that were written and dropped

**Restoring from the trash** was the obvious third path here, and it is in fact
the issue's headline ask. It notifies nobody on the fix's parent either. The
fixture held — the restored row comes back carrying its assignee, so this is
not a case that failed to build its precondition. A case green on both columns
warns about nothing, so it was not kept.

**It is now measured, and the shape theory is dead.** A diagnostic run
(32584328782) re-added this variant with a probe that reads, after the
checkpoint, the restored cell straight out of the physical column and counts
the `notification` rows addressed to the assignee for this table. On both
columns the cell holds a full user object — `id`, `email`, `title`,
`avatarUrl`, a string id, exactly the shape the notification extractor wants —
and the table has one notification row, the control assignment. Not a delayed
delivery, not a notification the assignee's list failed to show: nothing was
ever written.

So the value is republished and the notification is not produced. Of the two
candidates, "the trash snapshot's cell has the wrong shape" is ruled out and
"the restore does not reach that handler" is what is left, unproven. The
stored cell is what the event would carry, which is close to the event payload
but not the same reading; confirming it needs the event itself, not the column.

Worth flagging either way: the issue lists restore as notifying on both
engines, but its own confidence note puts that row in the group that was
"confirmed to go through the record create/update path but not run one by one".
It is an inference, and the measurement above contradicts it on the only
evidence either side has: no notification row is written, before the fix or
after.

**Duplicating a record** was written, run, and also dropped — for the opposite
reason. It reproduces on the parent _and_ on `develop`: the notification simply
arrives at the coalescing flush, around 9.7s instead of 9ms. But no issue asks
for record duplicate to be silent. The comparison table in the sibling issue
lists it as notifying on both engines today, and this issue excludes it by
name.

What makes it interesting anyway is that the PR added a `recordDuplicate`
source and left it out of the whitelist, so the code states an intent it does
not keep. That is a question for whoever owns the behavior, not something this
lab should encode as a requirement on its own, so the case is not shipped. It
is one commit away if the answer is that duplicates should be silent.

## This variant

Delete the assigned row, then undo. The undo replays the create, and a replay
re-issues the original request — so the event it publishes still reports its
source as a user. That is why this needed a separate fix from the
create-source whitelist.
