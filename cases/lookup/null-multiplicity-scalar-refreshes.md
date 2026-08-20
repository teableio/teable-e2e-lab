# lookup/null-multiplicity-scalar-refreshes

**Bug:** T6786 — `Unexpected unit of work error: error: operator does not exist:
text = jsonb`, dead-lettered permanently, on a self-hosted EE instance.

## What broke

A lookup field carries a multiplicity flag: is this cell one value or many?
When `is_multiple_cell_value` was NULL — unset, rather than false — the field
was read as multi-valued. Computed updates then generated a jsonb projection
for a column that is plain TEXT, and Postgres refused the comparison.

The failure classified as `computed_code_bug`, which is not retryable, so the
task went straight to `computed_update_dead_letter` without a single retry. The
table's lookup and rollup columns stopped refreshing, and every subsequent edit
produced another dead letter. On the reporting instance, 33 computed fields on
one table were red at once.

What makes NULL and false differ at all is history: the flag was added later,
so rows written before it exist with nothing in that column. Auditing the two
bases in the report against `pg_attribute` found the metadata and the physical
columns otherwise consistent — the only anomaly was this one field, and the
only difference between it and its working neighbours was NULL versus false.

## Reproduction

`foreign(text) ← host(link, lookup of that text)`, then:

1. Seed the foreign row and link a host row to it; let the lookup fill in.
2. Bring the physical lookup column down to scalar `text`, and set
   `is_multiple_cell_value = NULL` — SQL, see below.
3. Edit the foreign row's title, which is what queues the recompute.

Before the fix the cell comes back as `["beta"]` — a JSON array written into
a scalar column — instead of `beta`. After it, the cell reads the scalar.

## What the checkpoint asserts

That the lookup cell holds the edited title **as a scalar** within the settle
budget.

Note what this fixture does and does not reproduce. The root cause is the one
from the report — unset multiplicity is read as multi-valued, so the computed
update projects the multi-valued shape — but here that shape lands in the
column as an array string rather than colliding with a `text = jsonb`
comparison. So the case pins the defect and the correct behavior; it does not
reproduce the production dead-letter itself, and a reader should not take a
green cell here as evidence that computed tasks are no longer dead-lettering
for other reasons.

The timeout is still part of the assertion: the upstream edit answers 200 no
matter what, so nothing is raised at the caller — the only signals are a cell
that stays stale or a cell that fills in with the wrong shape.

Fixture verification, outside the checkpoint: the lookup resolves before the
drift, and the scalar value survived the column rewrite. Without the second
check, a cell that reads empty for a fixture reason would look exactly like the
bug.

## Why the data looks like this

The upstream edit changes the title (`alpha` → `beta`). Writing the same title
back queues no computed task at all, and the case would read the value the
pre-drift pass left in the column and call it a pass — the runner refuses equal
values for that reason.

The drift has two halves and both are necessary. A lookup created today is
stored as jsonb, so the column is converted down to `text` first: the fixture
is a table that predates the current storage choice, not one this code would
build. Then the metadata loses its multiplicity. Either half alone is a
different, consistent state that does not reproduce anything.

Both are written with SQL because that is a state no sequence of API calls
produces today — it is what a base that has been alive across the change looks
like. The observation is the ordinary record read.

## Sibling case

`lookup/null-multiplicity-scalar-converts` covers the other half of the same
report: the repair path out of this state. Both flip on the same fix, and they
are separate rows because they are separate things the user loses — one says
the table computes again, the other says it can be fixed by hand.
