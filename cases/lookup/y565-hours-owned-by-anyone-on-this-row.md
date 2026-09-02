# lookup/y565-hours-owned-by-anyone-on-this-row

**T1745** — fixed.

## What the user sees

A column reading zero for a team with plenty of work assigned to them.

"How much work is on my team" is the question a column like this answers: the
project row lists who is on it, the task rows each have one owner, and the
total is over the tasks owned by anyone on the list.

The comparison never matched. One person on a task and several on a project are
the same kind of thing written two ways, and asking whether the one is among
the several answered no every time.

Zero is the worst possible wrong answer here. It looks like an empty week
rather than a broken column, and it is the number a person would act on.

## What the checkpoint asserts

The staffed row totals the hours of the tasks that person owns, and the row
with nobody on it totals nothing.

The second half matters: a column that totalled everything regardless of who
owns the task would get the first row right.

## What the fixture has to hold

The person is really on the staffed row's team, read back before the total is
checked. Without that the column would be right to total nothing.

At least one task owned by the person — otherwise the expected total is zero,
which is exactly what the broken column returns — and at least one task owned
by nobody. The runner refuses any other fixture.
