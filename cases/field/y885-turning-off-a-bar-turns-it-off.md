# field/y885-turning-off-a-bar-turns-it-off

**T7238** — fixed.

## What the user sees

A number column drawn as a bar. Switching it back to a plain number is accepted
— the dialog closes, nothing reports a failure — and the column is still a bar.
Doing it again does the same thing, because what is sent the second time is
what was sent the first.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## How the clearing is said

The settings screen omits "show as" when the column goes back to being a plain
number, and the saved options simply do not carry it. The number path had no
branch for that absence, so it read as "nothing supplied" rather than "take it
away", and the change was planned as a no-op. The text and formula columns had
that branch already.

Saying it as an explicit `null` instead is refused by the request schema, on
both sides of the fix (run 34564638692), so the case sends what the screen
sends: the options without it.

## How the case is built

One number column created as a bar, then a save of the same column with its
formatting kept and the bar cleared.

Before the checkpoint the case requires the column to actually be a bar.
Clearing something that was never there is a green checkpoint that means
nothing.

## What the checkpoint asserts

The column read fresh is no longer drawn as anything, and it still has its
number formatting — a build that cleared the bar by resetting the whole column
would be a different fault with the same first half. The status alone is not
asserted as success: a request that answers 200 and changes nothing is exactly
this bug.

## Limits

One display type (a bar) on one column type. The branch the fix adds is the
same one the text and formula columns already had, so what it fixes is the
number path specifically.
