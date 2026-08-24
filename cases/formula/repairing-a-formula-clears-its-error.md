# formula/repairing-a-formula-clears-its-error

**T4929** — fixed.

## What the user sees

A column a formula reads is deleted, and the formula is flagged as broken —
correctly. The user repairs it by pointing it at another column. The repair is
accepted, and the flag stays. So do the old values.

There is nothing further to do: the action that was supposed to fix it has
already been taken. Whoever repaired the column knows it is fine; everyone else
sees a column marked broken with stale numbers under the mark.

## What the checkpoint asserts

The flag is gone **and** the column holds the value worked out from the new
column. A build that cleared the warning and left the old values would look
repaired and be wrong — which is the worse of the two failures, because the
warning was the only sign anything was off.

## What the fixture has to hold

The two columns hold different text, so a formula still reading the deleted
column and one reading the new column cannot produce the same answer; the
runner refuses a fixture where they would.

The formula is checked to be marked broken before the repair. Clearing a mark
that was never set would pass on any commit.
