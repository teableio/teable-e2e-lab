# base-share/y231-import-of-a-base-without-tables

**T6522** — fixed.

## What the user sees

A base with no tables in it cannot be imported. The request is refused, and the
copy is not made.

A base without tables is not a strange thing to have. It is what every base
looks like before the first table, and what an integration-only base — one that
carries automations, webhooks or an app and keeps its data elsewhere — looks
like permanently. Moving one to another instance or handing it to a customer
was impossible.

## Why

The structure import treated "this file describes no tables" as invalid input
rather than as nothing to do.

## What the checkpoint asserts

That the import returns a base at all. The refusal is an error response, so it
is thrown inside the checkpoint and reported as the bug rather than as a broken
case.

## Its sibling

`base-share/y230-import-keeps-field-descriptions` is the same commit's other half,
on the same runner: a base that does have tables loses the descriptions on its
fields.
