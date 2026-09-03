# lookup/distinct-choices-in-the-order-they-appear

**T7044** — fixed. On the `select-rollup-unique-and-count` runner.

## What the user sees

A parent row summarises its children's choice column. Two things are wrong at
once:

- the distinct values come back **sorted** rather than in the order of the rows:
  children reading "Todo" then "Done" produce "Done, Todo";
- when both children read "Todo", the count of distinct values answers **2**.
  It is counting rows.

Neither reads as a fault. A reordered pair of words looks like an arbitrary
choice the product made, and 2 is the number of children, so it is a number
somebody would act on.

What makes it findable is the other summaries on the same row. Join and compact
over the same column are correct, so the row shows "Todo, Done" and "Done, Todo"
side by side.

## What the checkpoint asserts

Both halves, in two phases:

1. as built — the distinct values are in row order, and there are as many as
   there are distinct values;
2. after one child is edited so the two agree — the distinct values collapse to
   one, and the count follows.

The second phase needs a real edit, not a rewrite of the same value: a write that
changes nothing schedules nothing, and the case would be reading the first
computation twice.

Both phases run even when the first found something, and the failure carries
everything at once. That is not tidiness: on a pre-fix commit the order is
already wrong in phase one, so a checkpoint that stopped there would never reach
the count — the fault that only appears once two children agree — and the second
half of the report would be asserted but never demonstrated.

Join and compact are read on every check as the **control**. They take the same
path from the same column, so if they disagree with the rows the whole summary is
broken and the failure says so rather than blaming the distinct values. When the
count is wrong, the message also says whether the number it gave equals the
number of linked rows, because that is what "counting rows" looks like and it
saves the next reader the arithmetic.

## Why the fixture is shaped this way

The children's choices must not already be in alphabetical order, and the runner
refuses a fixture where they are: sorting "Done" then "Todo" produces "Done,
Todo", which is also the right answer, so a summary that sorted instead of
keeping row order would look correct.

After the edit at least two children must agree, or counting rows and counting
distinct values give the same number and the second half proves nothing.

## The v1 column

v1 reproduces this on **every** column of the acceptance matrix, `develop`
included. The fix is v2-only, so anyone still on the older engine sees both
faults today: the distinct values sorted rather than in row order, and the count
counting rows.

The v1 column never fails a run — it is a reference, not a gate — so this is
reported rather than enforced. It is also the clearest thing the v1 column has
said so far: not "v1 was affected too", but "v1 still is".

## Its neighbour

T7066 (`893d0ce20`) reports the same wrong order, reached differently — through
records created by API rather than by hand, where the first computation comes out
wrong and a later recompute repairs it. Whether this case also settles that one
is a question for a matrix run against its parent, not an assumption.
