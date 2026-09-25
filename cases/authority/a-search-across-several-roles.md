# authority/a-search-across-several-roles

**T7581** — fixed (released before this case was written). On the
`multi-role-search-scope` runner.

## What the user sees

Under the authority matrix, a space editor holds several roles, each limiting
which rows they see. They search the table with "hide rows that do not match"
on. The count beside the search is right, but the grid shows more rows than
that - rows that do not contain the keyword at all.

Holding several roles merges their row scopes: "A's rows or B's rows". The
search was then added as "and contains the keyword", without brackets, so it
read "A or (B and keyword)" - every row role A could see came back.

## What the checkpoint asserts

Searching as the restricted person with non-matching rows hidden returns
exactly the rows holding the keyword.

## Why the fixture is shaped this way

The fix's own shape: 30 text columns, 5 rows, the keyword in 4 of them. Three
roles - one sees every row, one sees a single row, one sees every row again.
With two roles the leak depends on the order the scopes are joined in; with
three, the unbracketed part always holds a role that sees every row.

Outside the checkpoint the case checks the row count for the same search is 4.
That count was right on both sides of the fix, and it is what the returned
rows contradict.

The person joins as an Editor, as reported. Holding several roles needed
`framework/authority-matrix.ts` to take further roles
(`additionalRoles`); the existing matrix cases were re-run on the same
commits and stayed green.

## Evidence

Run 36123253484: on `a7e90ebdb2` and `1be9ae9f9f` (the fix's parent) the
search returned 5 rows, one without the keyword, while the count read 4;
absent on `develop` (`37830698a4`). `authority/y1299` and `authority/y386`
stayed green on all three columns.
