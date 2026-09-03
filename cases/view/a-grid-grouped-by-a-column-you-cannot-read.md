# view/a-grid-grouped-by-a-column-you-cannot-read

**T6944** — fixed. On the `group-on-an-unreadable-column` runner.

## What the user sees

Someone whose role withholds one column opens a grid that happens to be grouped
by that column. The grid loads **no rows at all**, with a message about a data
validation error.

Withholding one column is supposed to leave the rest of the table readable —
that is the point of withholding a column rather than the table. What they get
instead is a view that shows them nothing.

Nothing in the message names the column, and nothing suggests the grouping is
the thing to change. An administrator opening the same view sees everything,
which is the worst possible shape for a support conversation: the person who can
help cannot see the problem.

## Why

A view remembers what it is grouped by, and the page sends that grouping with
every request for rows. The server had two minds about a grouping it could not
honour: a grouping it resolved from the view itself was quietly narrowed to
readable columns, while a grouping that arrived on the request was refused. The
page sends the view's own grouping as if the person had typed it, so the refusal
is what ran — and because it is the grid's own request for rows that fails, the
result is no rows rather than no grouping.

## What the checkpoint asserts

The grouped request answers, and answers with every row the person is allowed to
see.

Both halves. A 200 carrying nothing would be the same empty grid with a friendlier
status.

## Why the fixture is shaped this way

Before the checkpoint, the same request is made **without** the grouping, and it
must return every row. That is the control: it says this person can read this
table, so a refusal afterwards is about the grouping rather than about them.

The fixture also requires that the withheld column really is absent from what
comes back. If the role were not withholding it, grouping by it would be an
ordinary request and the case would be reporting on nothing.

Exactly one column is withheld, and no rows are. This case is about a withheld
**column**; a role that also hid rows would make "every row the person is allowed
to see" a moving target.

## Which commit this settles, and which it does not

Not the one the issue id points at. Measured, one commit at a time:

| commit                                   | the grouped request                                  |
| ---------------------------------------- | ---------------------------------------------------- |
| `12407c409` — before `f70f0d508` (T6944) | 400, "Group references a field that is not readable" |
| `7bc91231d` — before `a4c8c3396` (T6944) | the same 400                                         |
| `f44a82cf8` — after both T6944 commits   | the same 400                                         |
| `8fd1e28b9` — before `2ae77481c` (T6997) | the same 400                                         |
| `2ae77481c`                              | 200, every row                                       |

So `bug.sourceCommits` names `2ae77481c`, which carries **T6997**'s id — "evaluate
v2 reads over masked values" — while `bug.issue` stays T6944, because T6944 is
what a person reported and this is that person's symptom.

Both commits carrying the T6944 id leave this path exactly as it was. They are
recorded in `docs/triage-ledger.md` as halves this case does not settle, rather
than claimed here.

The first attribution in this case was wrong and the acceptance matrix caught it:
the case was written claiming `a4c8c3396`, and the matrix answered red on a
column **after** that commit. Anything a case claims about which commit fixed
what has to come from a column, not from an issue id.

## The fixture behind it

The authority matrix, a role that withholds something, and a second signed-in
person holding that role all have to stand up together, and three other reported
bugs need the same three things. That setup lives in
`framework/authority-matrix.ts` rather than in this runner, and is setup-only for
the same reason `framework/fixture-db.ts` is: asking for it inside a checkpoint
throws. The restricted person's own requests are the observation.

## The v1 column

Skipped, and for the harness rather than the product: the case builds its own
base, and `framework/case-base.ts` unstamps only the base it manages, so a base
born inside a runner is born on v2. Same limitation as
`base-share/a-share-link-whose-database-is-away`.
