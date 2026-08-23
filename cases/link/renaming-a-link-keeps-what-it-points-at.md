# link/renaming-a-link-keeps-what-it-points-at

**T5389** — fixed.

## What the user sees

A link column is renamed and stops working. It still looks like a link; it just
no longer reaches anything, and the cells can no longer be filled in.

## Why

A link field's configuration is what makes it a link: which table it reaches,
whether it holds one row or several, and the column it puts on the other side.
A rename says nothing about any of that, and a request that changes only the
name should leave all of it alone.

## What the checkpoint asserts

Four things about the field afterwards, and one about the other table:

- it is still there, and named the new name
- it is still a link
- it still points at the same table
- it still holds the same number of rows
- the column it put on the other table is still pointing back

The last is the half a person notices from the other side, and it is a separate
loss: a link can keep its own configuration and still leave the other table
with an orphan.

## Why the field is read back rather than the reply

What matters is what the column _is_ now. A reply that echoed the request would
say nothing about that, and this repository has already had one case where the
broken build answered 200 and changed nothing —
`field/clearing-a-checkbox-default-saves`.

The status is still kept, because a build that refuses the rename and one that
accepts it and loses the configuration are different failures.
