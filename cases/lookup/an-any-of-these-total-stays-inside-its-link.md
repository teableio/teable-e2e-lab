# lookup/an-any-of-these-total-stays-inside-its-link

**T7004** — fixed. On the `or-filtered-rollup-scope` runner.

## What the user sees

A project row totals the work linked to it, narrowed to "status is todo **or**
status is doing". The figure is too large: it includes work belonging to other
projects, as long as that work matches the condition.

The number looks fine. It is a real sum of real rows, in the right units, of the
right order of magnitude — there is nothing to notice. What the report actually
leads with is the other symptom: a project created a moment ago, joined to
nothing at all, already showing a figure.

## Why

"Any of these" is written as OR. The link scope — "and linked to this row" —
was being combined with the condition in a way that let the OR swallow it, so
the query asked for every matching row in the other table instead of every
matching row _among this row's_.

## What the checkpoint asserts

Two things:

- the row linked to nothing totals nothing, and
- the linked row totals exactly its own selected work.

The first is the one a person would notice; the second is the one that says the
condition still works. A build that fixed the scope by ignoring the condition
would pass the first and fail the second.

## Why the fixture is shaped this way

Three kinds of row in the other table, and the runner refuses to run without all
three:

- linked to this project and selected by the condition — what should be counted;
- linked to this project and excluded — proves the condition is still applied;
- selected by the condition but belonging to another project — proves the link
  is still applied.

Drop the third and a total that ignored the link entirely would give the right
answer, and the case would be green on both sides of the fix. The other
project's amounts are an order of magnitude larger than this one's, so a total
that escapes is unmistakable in the failure message rather than merely wrong.

The wait before the checkpoint is on the **linked** row reaching its correct
total — waiting for the computation to finish, not for the bug to show up. The
unlinked row is then read out of that same settled response.
