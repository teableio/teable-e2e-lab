# base-share/y577-a-duplicated-base-in-the-recent-list

**T2571** — fixed.

## What the user sees

A copy that looks like it was never made.

Duplicating a base is what people do before trying something they are not sure
about. The copy is the thing they are about to work in, so the place they look
for it next is the same place they look for everything they were just working
in — the list of bases recently opened.

It was not there. Not listed late: absent. To someone who has just pressed
duplicate and is looking at a list that does not mention it, the copy did not
get made, and the next move is to press duplicate again — which makes a second
copy that is also not there.

## What the checkpoint asserts

The copy is in the list, and it is at the front.

Both, because a "recently opened" list without the thing just opened at the
front is a list nobody can use.

## What the fixture has to hold

The list answers at all, and does not already carry a base by the copy's name.
A list that came back empty for its own reasons would have the checkpoint
reporting the wrong thing.
