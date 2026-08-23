# formula/formula-over-a-looked-up-date-follows-a-change

**T5809** — fixed.

## What the user sees

A status column stops updating. Not the formula somebody wrote over a date —
the ordinary column next to it, which has nothing to do with dates and was
working yesterday.

## Why

A lookup of a date is stored as json, not as a date, and a formula reading one
has to unwrap it before treating it as a date. It did not, so the computed
update failed — and a computed task is per table, so the failure took every
other computed column on that table with it.

That is why the report is about the neighbour: the column that broke is not the
column that caused it, and nothing on screen connects them.

## How the case is built

A source row with a date and a status, a host row linking to it, and three
computed columns on the host: the date lookup, an ordinary status lookup with
nothing wrong with it, and the formula over the date lookup.

The status lookup is the point. It is what shows the failure spreading past the
column that caused it, and asserting it is what makes this case about the
reported symptom rather than about the formula alone.

Both columns are checked before the change — a formula that never worked would
make "it stopped following" describe something that never followed — and the
two dates and two statuses have to differ, or the write queues no recompute at
all.

## Its sibling

`formula/scalar-value-over-linked-text` is the same shape over a number read
through a lookup. The failures are different casts of the same json-versus-value
confusion, fixed separately.
