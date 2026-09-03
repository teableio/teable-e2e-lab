# lookup/two-records-with-one-name-are-two-records

**T7082** — fixed. On the `link-rollup-unique-by-identity` runner.

## What the user sees

A row summarises the distinct linked records reached through its children. Two of
those records are different records that happen to be called the same thing — a
name is a value someone typed, and nothing stops two rows sharing one.

The summary lists them once. A real linked record has left the answer.

Nothing indicates it. The column is not marked, and what comes back is a
plausible list of names. The only way to notice is to count it against the
summary beside it that keeps everything. Whatever reads the column next — a
formula, a count, a filter, a report, an automation — is short by one and cannot
tell.

## Why

Uniqueness was decided by comparing what the summary displayed rather than what
it held. Two records with one name look identical that way. They are not
identical: they have different ids, which is what makes them two records.

## What the checkpoint asserts

Not a list of names. It asserts that the **distinct** summary equals the
**keep-everything** summary — because when every linked record is a different
record, those two are the same answer.

That invariant is the point of the shape. It holds whatever these cells contain,
and what they contain has changed more than once: the same issue was fixed in two
commits, the second of which changed how link values are rendered. A case that
pinned an expected list of names would have been rewritten by that second commit
without the behaviour it guards having changed at all.

The keep-everything summary is checked first, as the control: it must hold one
entry per linked record. If it does not, the chain never computed and the
comparison would be between two wrong answers. The settle loop waits on that
same column, which is correct on both sides of the fix — waiting on the column
under test would be waiting for the bug to go away.

When the distinct summary is short, the failure says how many records left the
answer, because that number is the whole report.

## The two commits, and what each stage looks like

This issue was fixed twice, and the case tells all three states apart. Measured:

| commit                        | the keep-everything summary | the distinct summary         |
| ----------------------------- | --------------------------- | ---------------------------- |
| `d09c75728` (before both)     | three `{id, title}` records | `["Same", "Other"]`          |
| `692c2b4b5` (after the first) | three `{id, title}` records | `["Same", "Same", "Other"]`  |
| `develop`                     | three title strings         | the same three title strings |

The first fix restored the record that had gone missing. The second changed what
these cells hold, so the two summaries stopped disagreeing about shape as well.
Both are named in `bug.sourceCommits`, and the middle row is why: after the first
commit the identity is right and the two answers still do not match.

An expected list of names, written into the case, would have been "correct" on
the middle row and rewritten by the second commit — a case edited to follow the
product rather than to hold it in place.

## Why the fixture is shaped this way

Three tables. The summary's source has to be a **link** column — that is the
column type whose values carry an identity separate from what is displayed — so
there is a table of target records, a table of children each pointing at one
target, and a parent summarising across the children.

At least two targets must share a name, and the runner refuses a fixture where
they do not: with every name different, merging by name and keeping by identity
give the same answer and the case would be green on both sides of the fix.
