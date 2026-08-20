# view/incomplete-filter-condition-survives

## Where the bug came from

T6568. In the filter panel, a user clicked "add filter", picked a field, and the
condition **disappeared on its own** — no chance to choose an operator or a
value. The user confirmed on 2026-08-09 that it was still happening.

The cause is in `ViewSourceFilter`. v1 stores a list-operator condition the user
has not finished (`value` is `null` or `[]`) exactly as written and skips it at
query time; v2's schema instead **dropped that shape on both read and write**,
so the condition the panel had just written was gone by the next read — which
looks, to the user, like the field they picked vanished under the cursor.

## Two assertions, pulling against each other

The fix has two halves, and doing only one of them creates a worse bug:

| assertion                                | what it protects                         | doing only the other half            |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------ |
| the saved filter reads back unchanged    | the panel can keep editing the condition | this is T6568 itself                 |
| the unfinished condition filters nothing | the view stays usable while being edited | a `hasAnyOf []` would hide every row |

So the checkpoint asserts both. With only the first, an implementation that
keeps the condition _and_ queries with it would empty the whole table while the
case stayed green.

## Fixture

A two-column table: `Title` (single line text) and `Tags` (multiple select —
the choice names take part in no assertion, since the unfinished condition
carries no value, which is the entire point). Three rows, of which only `kept`
is selected by the finished half of the filter.

Three rows rather than one is deliberate: with a single row, "the finished
condition still selects" and "the unfinished one hid everything" look identical.

The saved filter has a fixed shape, written in the runner rather than in the
case:

```
and
├── Title  is        "kept"        ← the finished half
└── Tags   hasAnyOf  null          ← what the panel writes on picking a field
```

## About v2

The code that dropped the condition is v2's `ViewSourceFilter`. There is one
engine here and the case does not declare it; the runner proves it in setup by
saving an ordinary filter first and asserting
`x-teable-v2-feature=updateViewFilter` on that response. That does two things at
once: it shows saving a filter works at all (otherwise the question below is
unanswerable), and it shows the request went to the v2 feature the bug lives in.
The first version of this case ran on v1 and was meaningless green in every
column. See `framework/engine.ts`.

## Phases and the verdict boundary

**Setup (failure = 💥 error).** Create the table, seed 3 rows, take the default
view, and read it **before any filter is saved**, asserting all 3 rows are
there. Every conclusion below is "which rows did the view return", so a view
that already hid rows would make the checkpoint answer a different question.

**Checkpoint `incomplete-condition-survives-and-filters-nothing` (failure = ❌
bug reproduced).** Save the filter, read the view back and compare it to what
was sent, then read rows through the view and assert only `kept` comes back.

The filter comparison canonicalises each condition to a
`(fieldId, operator, value)` triple: the product answers the same conditions
with its own key ordering, so comparing raw JSON would report "the filter came
back changed" on every run. What is compared is what the filter _means_, which
is exactly what the bug destroyed — a whole condition going missing.

## Expected status

`status: fixed`. The fix is on develop (3f15439a3); reproducing it again is a
regression.
