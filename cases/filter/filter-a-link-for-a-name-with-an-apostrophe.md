# filter/filter-a-link-for-a-name-with-an-apostrophe

**T7305** — fixed (released before this case was written). On the
`contains-filter-quote` runner.

## What the user sees

A contact list linked from another table. Filtering that link column with
"contains O'Brien" fails: the view does not load, and the error is a SQL
syntax error. Any value with an apostrophe does it - O'Brien, it's, don't.

On a column that stores a list - links, people, several choices - "contains"
wrote the typed value into the query as text, and the apostrophe ended that
text early. The same flaw let a crafted value run SQL of its own; this case
asks only the harmless half.

## What the checkpoint asserts

Filtering the link column for `O'Brien`, then for a lone `'`, answers 2xx
with exactly the rows whose linked title contains it - worked out locally
from the titles (1 and 2).

## Why the fixture is shaped this way

Three linked titles: two with an apostrophe, one without. Outside the
checkpoint the same filter runs with `Plain` - no apostrophe - and has to find
its row, served by v2. That is the control: the filter works, so a failure
afterwards is about the apostrophe.

## Evidence

Run 36124976241: on `c3bf5889c4` (the fix's parent) filtering for `O'Brien`
answered 500, `syntax error at or near "Brien"` (pgCode 42601); on the fix
`2124a06aa0` and `develop` (`37830698a4`) it found 1 row, and `'` found 2.
