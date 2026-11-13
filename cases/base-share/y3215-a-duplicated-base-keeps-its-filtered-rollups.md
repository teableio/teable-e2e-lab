# base-share/y3215-a-duplicated-base-keeps-its-filtered-rollups

**T8332** — fixed in `3372dd9b2`.

## What the user sees

After copying a project, its summary columns show different counts from the project it was copied from.

## What the checkpoint asserts

After duplicating the base with records, every filtered countall rollup in the copy reads what it reads in the original, parent by parent.

## What the fixture has to hold

A space created for the run (and deleted afterwards) with one base: parents, and children with a single-select status linked many-to-one to them. The original base must read the expected counts before it is duplicated.
