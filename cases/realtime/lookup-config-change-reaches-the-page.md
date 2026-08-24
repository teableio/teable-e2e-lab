# realtime/lookup-config-change-reaches-the-page

**T4802** — fixed.

## What the user sees

Changing which column a lookup reads is a two-step edit in practice: pick the
column, look at what came back, adjust. The change is saved, and the settings
on screen do not move. Reloading the page shows it applied all along.

The cost is the second step. The person makes the change, sees no change, and
makes it again.

## Why

What went out to the open page was a stripped-down copy of the column: missing
the parts that say how the two tables are joined, and with the kind of value
left blank. A page receiving that has to reject it, so it keeps what it had.

## What the checkpoint asserts

Two halves of the same thing: the page ends up holding the **new** target
column, and holding it in a shape a client can use — the join details and the
kind of value are both there. A push carrying the new target in a shape the
page must reject is exactly the failure under test, so asserting the target
alone would miss it.

## What the fixture has to hold

The page is checked to be holding the column pointing at the first target
before the change. Otherwise the assertion could be satisfied by a client that
never had the old value.
