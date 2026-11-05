# automation/an-automation-from-before-the-upgrade-still-links-across-bases

**T8375** — fixed in `127c132b0` (#4419, which rolled back the checks introduced by `d6c5aaa97`, #4371).

## What the user sees

An automation that has worked for months starts failing on every run right
after an upgrade, with "Cannot authorize reciprocal target record updates",
whenever it links a record to a record in another base. Nobody changed the
automation, and it only recovers once someone switches it off and on again.

## What the checkpoint asserts

After the automation's active snapshot looks like one taken before the
upgrade, the next follow-up record it handles is linked to its order on both
sides of the two-way link within the settle timeout.

## What the fixture has to hold

A space created for the run (and deleted afterwards) with two bases: orders
in one, follow-ups in the other, joined by a two-way link. An automation in
the follow-up base finds the order a new follow-up names and links them. A
first follow-up is handled while the automation is freshly activated and must
be linked on both sides, which proves the automation itself is sound. Then
the active snapshot is stripped of what activation records about who
activated it (setup only, with the database), the state every automation
activated before the upgrade is in.
