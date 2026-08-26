# formula/y160-scalar-value-over-linked-text

## Where the bug came from

T6844: a single-valued number formula referencing a link/lookup produced a
jsonb-array-to-double cast and Postgres answered 22P02. The computed UPDATE for
`VALUE({lookup})` wrapped `jsonb_agg(...)` directly in `::double precision`,
which fails for a value like `[0.0003]`. The same batch includes
`ca79dcb9c` (T6845),
classifying 22P02 as non-retryable — retrying a syntax error only wastes time.

## What the user sees: nothing

That is where this case's shape comes from. The failure happens inside the
computed pipeline: the write answers 200, the task fails, retries, and
dead-letters, and **nothing comes back to the caller**. What the user sees is a
cell that stays empty forever.

So the whole case — observation included — goes through the public API: it waits
for the value the way the user's grid does, and **a value that never arrives is
the bug**. No `computed_update_dead_letter` to read, no internal queue to drain.

It also means **the timeout is the assertion**, not an incidental number: too
short and a slow-but-working pipeline reads as the bug; long enough and "never"
is the only thing that fails. 30s here, against under 1s observed on develop.

## Fixture

```
Source table                       Host table
──────────────                     ────────────────────────────────
Title (text) = "0.0002"     ←──    Rates (link, oneMany)
                                   Rate Titles (lookup of Title)
                                   Conversion Rate (formula VALUE({lookup}))
```

Three decisions are load-bearing:

- **oneMany**, not manyOne — the link and its lookup are therefore stored as
  **json arrays**, the shape the failing cast could not read.
- **Title is a text field**, not a number field. The value has to reach the
  formula as text inside a json array; a number field would store a number and
  the case would be about something else.
- **The formula is created after the row exists**, so the first computed pass is
  a backfill, which is the path the production failure was reported from.

## Phases and the verdict boundary

**Setup (failure = 💥 error).** Build both tables, the link, the lookup and the
formula, read the host row once, and assert on **that read's response** that
`x-teable-v2=true` and `x-teable-v2-feature=getRecords`. Every conclusion below
is "did the computed value arrive", which is unanswerable if the row is not
there or a different engine is answering.

**Checkpoint `computed-value-arrives` (failure = ❌ bug reproduced).** Change the
source row from `0.0002` to `0.0003` to force a recompute, then poll the host
row until the formula reads 0.0003.

**Changing** the value rather than rewriting the same one is a lesson paid for:
the first version wrote the same value back, which is a no-op update that queues
no computed task at all, so the case kept reading the successful backfill from
when the formula field was created — green on both sides of the fix, proving
nothing. The runner now refuses a config where `sourceValue === sourceValueAfter`.

On the pre-fix commit that change fails outright with a 500:

```
Failed to update record: error: invalid input syntax for type double precision: "[0.0003]"
```

— the same sentence as the production report. The polling and the timeout stay
because this path can also present as "the write succeeded and the value never
arrives" (the task dead-letters and the caller is told nothing); the checkpoint
counts both shapes as reproduction.

`0.0003` comes from the report. A leading-zero decimal is what makes the failure
legible: `[0.0003]` is a string Postgres will not read as a double, while a
value like `3` can survive a broken cast by accident.

## Expected status

`status: fixed`. The fix is on develop (662cfde02); reproducing it again is a
regression.

T6844 was still filed under "Entered development workflow" in the issues table,
but `bug.status` is judged from the state of the code, not from a workflow
label — the fix is merged into develop, so it is `fixed`.
