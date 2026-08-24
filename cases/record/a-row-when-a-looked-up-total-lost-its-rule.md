# record/a-row-when-a-looked-up-total-lost-its-rule

**T6911** — fixed.

## What the user sees

Three tables that suddenly refuse to work together. Adding a row, listing rows,
opening the view — all answered with an error about a totalling rule the person
never wrote and cannot see anywhere in the interface.

The chain is ordinary: amounts roll up into a highest rate on one table, and a
third table looks that rate up. The lookup at the end carries a copy of the
rule, and a column converted back and forth can end up without it. Each table
is fine on its own, which is what makes it hard to place.

## What the checkpoint asserts

A row is added at the far end of the chain **and** the table at the near end
still lists. Both were refused, and the second is what makes "the chain cannot
be loaded" rather than "one write failed".

## What the fixture has to hold

A row is added before the damage, so a refusal afterwards is the missing rule
rather than the chain never having worked.

The missing rule is written with SQL: no request produces that state, which is
also why nobody can put it back from the interface.
