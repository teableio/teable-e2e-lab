# record/archive-a-row-your-role-says-you-may

**T7025** — fixed. On the `archive-granted-by-the-matrix` runner.

## What the user sees

Somebody's role grants them archiving. They select a record they are allowed to
see and archive it. They are told they do not have permission.

The settings screen shows the role, shows archiving granted, shows the record
inside their reach. Everything looks correctly configured, because it is. The
refusal names neither the role that grants the action nor the thing that
withholds it, so there is nothing to change and nothing to look at.

## Why

Giving somebody a role in the authority matrix also puts them in the base, and it
puts them in as a **Viewer**. A Viewer, by their base role alone, may not archive
anything.

Two gates read those two answers — the base role, and the matrix. The base role
was checked first, so the answer was always the Viewer's, and the role's grant
never got a hearing.

The report describes this happening in a grouped and sorted view. That was
incidental; the fix says so, and this fixture leaves it out.

## What the checkpoint asserts

Two things:

- archiving a row the role reaches **succeeds**, and the response names the row
  it archived;
- archiving a row the role does **not** reach is still refused.

The second half never goes red — being refused everything is also being refused
this — and it is not there to catch the reported bug. It is there because the
cheapest wrong fix is to stop checking, and that fix would pass the first half.

## Why the fixture is shaped this way

The person arrives **through the role alone**, with no invitation to the space
first. That is the whole shape: it is what makes them a Viewer. Invited as an
editor, their base role would permit archiving on its own, the gate that reads it
first would answer correctly by accident, and the case would be green on both
sides of the fix.

Before the checkpoint, the fixture requires that the person sees exactly the rows
their role scopes them to. Seeing none, a refusal afterwards would be about
reaching the table at all rather than about archiving; seeing all of them, the
row scope is not in force and the second half of the checkpoint proves nothing.

## The fixture behind it

`framework/authority-matrix.ts`, shared with
`view/a-grid-grouped-by-a-column-you-cannot-read`. This case added the `join`
option to it: how somebody gets into the space is not a detail here, it is the
bug.

## The v1 column

Skipped, for the harness rather than the product: the case builds its own base,
and `framework/case-base.ts` unstamps only the base it manages, so a base born
inside a runner is born on v2.
