# user-field/record-duplicate-does-not-renotify-assignee

**T6663** — **open**. On the `user-field-notify-replay` runner; the shared
design is described in `user-field/undo-of-delete-does-not-renotify-assignee`.

## What this case found

Duplicating a record still notifies the assignee a second time. Not only on the
fix's parent — on `develop` too. This case is the only one of the three on this
runner that reproduces on both columns, which is why its status is `open`
rather than `fixed`.

|                   | `8706bd35d` (pre-fix) | `develop` |
| ----------------- | --------------------- | --------- |
| notification      | arrives               | arrives   |
| after the request | 9 ms                  | 9.7 s     |

The delay is the whole story. The same PR that stopped the duplicate's _create_
from notifying also introduced a 10-second window that coalesces notifications
per actor and table. 9.7 s is that window flushing. So the create projection is
being skipped exactly as intended — and something the duplicate does after the
create still reaches the dispatcher and buffers into the window opened by the
first, legitimate assignment.

## How that was isolated

The other two cases on this runner share every step of this one except the
action: same table shape, same first assignment, same control notification at
roughly half a second, same 25-second quiet budget spanning well past ten
seconds. Both stayed silent for the whole budget on both columns.

So the delayed notification is not a second copy of the control, and not a
property of the runner. It follows the duplicate.

## Why the fix's own test does not see it

Its negative assertion waits 8 seconds. The coalescing window is 10. The test
stops looking two seconds before the notification is delivered, and the same PR
introduced both numbers.

That gap is the reason this case is worth keeping in an `open` state rather
than dropped: the behavior is invisible to the suite that was written for it,
and a case that reproduces on `develop` and says so is exactly what an `open`
status is for. If it starts passing, the lab reports it as unexpectedly fixed
and asks for the status to be flipped.

## The budget

`quietTimeoutMs` is deliberately longer than the coalescing window. A budget
that stopped at eight seconds would have reported this case green on `develop`
and shipped a fix that is not there.
