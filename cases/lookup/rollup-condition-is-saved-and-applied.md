# lookup/rollup-condition-is-saved-and-applied

**T6179** — fixed.

## What the user sees

A summary column is narrowed — "count only the paid ones" — the dialog closes,
and the number does not change. Reopening the field shows no condition: it was
never saved.

The number that stays is the total of everything, which is a plausible-looking
number. That is the part worth guarding: a summary that broke loudly would be
noticed, and this one gets copied into a report instead.

## Why

Converting the field mapped its link and lookup ids across and dropped
`lookupOptions.filter` on the way. Rollups had no place to carry a condition;
lookups did.

## How the case is built

Three linked rows in two categories, and a plain rollup totalling all of them
first. The total of everything is checked before the condition is added —
otherwise a number that happened to match could not be told from one that was
never computed.

Both a counted row and an excluded one are required: with only counted rows, a
condition that was dropped and one that was applied give the same total.

## What the checkpoint asserts

Two things, and the second is the one that matters to a reader of the summary.

The condition comes back on the field — it was saved. And the total drops to
the sum of the rows it selects. A build that stored the condition and ignored
it in the query would be the same wrong number with better-looking metadata.
