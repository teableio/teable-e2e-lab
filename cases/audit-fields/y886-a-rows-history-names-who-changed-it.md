# audit-fields/y886-a-rows-history-names-who-changed-it

**T4966** — fixed.

## What the user sees

Two people are working in the same base. A row's history names the wrong one of
them as having made a change.

Naming the wrong colleague is worse than naming nobody. History is what "who
changed this" is answered from — when a number looks wrong, when a record says
something nobody expected — and a confident, checkable-looking answer sends the
question to somebody who was not there.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why it takes two people

The history entries are written after the request has already answered, on a
queue shared by everybody working in that base. Who made the change was read at
the moment that queue was drained rather than carried on the change itself — so
whoever's request happened to trigger the drain was stamped onto everybody's
entries.

One person working alone is always the right answer. Two people writing at the
same time is the whole bug, and it is also the ordinary state of a shared base.

## How the case is built

One table, twelve rows, six belonging to each person, and every row written at
the same time in one burst. Each row has exactly one person who touched it, so
a wrong attribution is unambiguous rather than a question of ordering.

The second person is a real signed-in collaborator, invited to the space as an
editor. Before the checkpoint the case makes them write once and requires that
write to succeed: if they cannot write, every row would be the first person's
and the case would be watching one writer.

## What the checkpoint asserts

Every row's newest history entry names the person who wrote that row. Rows with
no history at all are reported separately — that is a different fault, and this
case is about what the history says, not whether it exists.

## Limits

A concurrency case: it can only be as reliable as the overlap between the two
bursts. Twelve rows in one burst is what reproduced; fewer rows means fewer
chances for one person's drain to run inside the other's request.
