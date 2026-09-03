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

## Which commit this settles

Two commits carry this issue id, and the case is red on both sides of the first
one. Measured:

| commit                                                 | grouped request                                      |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `12407c409` (before `f70f0d508`)                       | 400, "Group references a field that is not readable" |
| `7bc91231d` (before `a4c8c3396`, so after `f70f0d508`) | the same 400                                         |
| `develop`                                              | 200, every row                                       |

So `bug.sourceCommits` names `a4c8c3396` only. The earlier `f70f0d508` is the
same issue reached down a different path — a grouping the server resolves from
the view itself rather than one that arrives on the request — and this case does
not tell it apart. It is recorded in `docs/triage-ledger.md` rather than claimed
here.

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
