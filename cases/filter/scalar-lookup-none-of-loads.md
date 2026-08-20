# filter/scalar-lookup-none-of-loads

## Where the bug came from

T6571. A customer table on app.teable.cn **would not open at all**:

```
Socket Error
internal_server_error: Failed to load table records:
error: COALESCE types text and jsonb cannot be matched
```

A scalar lookup — one whose target is a single-value field such as a select — is
stored as a plain scalar, but the filter path compiled it as the JSON array a
multi-value lookup would be. `isNoneOf` therefore built a COALESCE comparing
text against jsonb, which Postgres refuses. The user sees no filter error at
all: **the table simply returns no records**.

## Fixture shape

```
Reference table              Host table
─────────────                ──────────────────────────────
Reference (text)      ←──    Reference (link, manyOne)
Category (select)     ←──    Reference Category (lookup, scalar)
```

The reference table holds one row per category, named after the category, so a
row's category is readable straight off the link — nobody reading the report
has to consult a second mapping.

The host table holds 4 rows: one each for `Allowed`, `Excluded A`,
`Excluded B`, plus one that **links to nothing**. That last row is required: it
is what separates "the filter is too eager" from "the filter is broken" — the
`isNotEmpty` half must remove it, and the `isNoneOf` half must not touch it.

The saved view does three things with **the same lookup field**:

| use    | condition                                              |
| ------ | ------------------------------------------------------ |
| filter | `isNotEmpty` + `isNoneOf ["Excluded A", "Excluded B"]` |
| sort   | lookup ascending, then `Task` ascending                |
| group  | lookup ascending                                       |

Those are three independent consumers of the same expression, and the view that
broke in production had all three.

Declaring **two** excluded categories is not padding: a single-element
`isNoneOf` can be compiled to an equality test, which would route around the
array path the failure lives on.

## About v2

This failure is on v2's record query path only, and the first version of this
case was caught by exactly that: the lab defaulted to v1 back then, v1 never had
the bug, and all four columns were green while proving nothing.

There is one engine here now and the case does not declare it. The runner
asserts on **the record read itself** that `x-teable-v2=true` and
`x-teable-v2-feature=getRecords` — the very read whose SQL the bug breaks. A
separate probe would not be enough: a probe reaching v2 while the read under
test does not is precisely the shape worth catching. See
`framework/engine.ts`.

## Phases and the verdict boundary

**Setup (failure = 💥 error).** Build both tables, the link, the lookup, and 4
rows, then read **without a view** and assert all 4 rows are present with the
lookup resolved to the right category on every linked row. The failure below is
"the view will not load"; if the plain read cannot load either, that is a
different fault and must be judged 💥 rather than mistaken for this bug.

**Checkpoint `saved-lookup-view-loads` (failure = ❌ bug reproduced).** Save the
filter, sort and group, then read by `viewId` and assert exactly
`["allowed-task"]` comes back.

Two failure shapes count as reproduction here: a 500 (the original form —
`bugCheckpoint` counts anything thrown as a reproduction) and the quieter one
where the view loads but selected the wrong rows, which only a row-by-row
comparison catches.

## Expected status

`status: fixed`. The fix is on develop (d45bf6f32); reproducing it again is a
regression.
