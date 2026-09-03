# field/y221-required-default-backfills-existing-rows

**T5685** — fixed. On the `required-default` runner.

## What the user sees

A column is marked required and given a default, and the field editor will not
save it — the table already has rows, and they are judged empty before the
default has been written into them.

The way out is to add the column without the requirement, fill it, and then
mark it required. On a table with any history at all, that is the only way.

## Why

"Required" and "has a default" are a pair: the default is the answer for
everyone who does not supply one. The existing rows were checked against the
constraint before the default reached them. ## What the checkpoint asserts

The request succeeds **and** the existing row holds the default. A request that
succeeded while leaving the cell empty would be the same column without its
promise, and the requirement is the promise.

The request goes through raw axios with the status left open: it is the request
that is refused before the fix, and the generated client throws on a non-2xx
and drops the response with it.

The fixture confirms the table holds a row before the column is added, because
the rows that are already there are what the constraint is checked against.

## The sibling that is not here

The same wrong order was fixed separately for record creation (T5686,
`9bc67c4be`): a record created without the column was refused before its
default applied. Built on this runner and green on both columns — that path
already worked on its own fix's parent. It is recorded in
`docs/triage-ledger.md`, and the runner keeps its `onCreate` shape.
