# record/y2803-a-duplicated-row-starts-unpressed

**T7782** — fixed in `cbe47ace7`.

## What the user sees

A copied row's button reports presses nobody made on it; under a cap it
cannot be pressed at all.

## When it existed

The bug arrived with the fix for T7733 (`fdea29bbe`), which made click counts
written through the record API persist; before that, duplicating a row could
not carry a count either. So the case is green on revisions older than
`fdea29bbe`, red between it and `cbe47ace7`, and green again after. Observed
on `9fd99f28c`: the copy reads `{"count": 2}`.

## What the checkpoint asserts

The duplicate is served by v2, the copy has no click count, and the
source's count is unchanged.

## What the fixture has to hold

The source is pressed twice through the real button endpoint (the button
carries a workflow, as a pressable one must), and the count is read back
before duplicating.
