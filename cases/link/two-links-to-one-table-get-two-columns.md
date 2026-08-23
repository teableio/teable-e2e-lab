# link/two-links-to-one-table-get-two-columns

**T6355** — fixed.

## What the user sees

A table that links to the same other table twice — a requester and an approver,
both people; a shipping address and a billing address, both addresses — created
in one go. What comes back is wrong in one of several ways depending on where
the collision lands: the create is rejected, or the other table gets one column
where it should have two, or the two links quietly share the storage that
carries their values.

The last is the one worth building a case around, because it is invisible from
the grid: linking a row through one field makes it appear in the other.

## Why

Each link field puts a matching column on the table it points at. The names for
those columns were planned against the table as it stood **before** the
request, not against the table as the request was building it, so two links
created together were both handed the same name.

Adding the two links one at a time from the field editor works — the first one
is committed before the second is planned. The collision needs both planned
against the same starting state, which is what creating a table with both of
them does.

## What the checkpoint asserts

Two things.

The other table has two columns for the two links, and they are named
differently. That is what a person sees.

And the two links do not name the same junction table. That is what a person
does not see, and it is the worse failure: shared storage means a row linked
through one field shows up in the other, with nothing in the interface
suggesting why.

## Where the create sits

Inside the checkpoint, not before it. One of the outcomes of the collision is
the create request being refused outright — measured on `e6111bf09`, which
answers `Field names must be unique` — and a table built outside the checkpoint
would report that refusal as a broken case rather than as the bug. The first
run of this case did exactly that (run 32658657786).

## Limits

Two many-many links. The fix is about planning names against rolling state, and
nothing here explores three links, other relationship kinds, or adding a link
to a table that already has one.
