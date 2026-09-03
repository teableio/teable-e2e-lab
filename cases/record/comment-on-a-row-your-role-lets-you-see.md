# record/comment-on-a-row-your-role-lets-you-see

**T7034** — fixed. On the `comment-granted-by-the-matrix` runner.

## What the user sees

Their role says they may comment on records. They open a record they are allowed
to see, type a comment, and are told the resource is restricted and they do not
have permission.

They can see the record. They can open it. They can read the thread. They cannot
add to it, and the message names nothing they could change — because from the
settings screen nothing is wrong.

## Why

Giving somebody a role in the authority matrix also puts them in the base, and
puts them in as a **Viewer**. A Viewer, by their base role alone, may not
comment.

Commenting was gated on the base role alone, so the role's grant never reached
the write.

## What the checkpoint asserts

The comment is accepted **and** it is in the thread afterwards. A write that
answered and left nothing behind would be the same silence with a friendlier
status.

Then: commenting on a row the role does **not** reach is still refused. That half
never goes red — being refused everywhere is also being refused there — and it is
not there to catch the reported bug. The same change had to bound commenting by
the role's row conditions, which the base-role path never applied at all, so a
fix that simply stopped checking would pass the first half and fail this one.

## Why the fixture is shaped this way

The person arrives **through the role alone**, with no invitation to the space
first. That is what makes them a Viewer, and the Viewer's base role is the thing
that was answering. Invited as an editor, their base role would permit commenting
on its own and the case would be green on both sides.

Before the checkpoint, the fixture requires that they see exactly the rows their
role scopes them to — seeing none, a refusal afterwards would be about reaching
the table; seeing all, the row scope is not in force and the second half proves
nothing.

## Its sibling

`record/archive-a-row-your-role-says-you-may` (T7025) is the same fault on a
different action, fixed separately. Both stand on
`framework/authority-matrix.ts`; the shape they share — a matrix grant that never
reaches the write because a base role answered first — has now been found twice,
in archiving and in commenting.

## The v1 column

Skipped, for the harness rather than the product: the case builds its own base,
and `framework/case-base.ts` unstamps only the base it manages.
