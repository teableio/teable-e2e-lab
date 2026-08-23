# link/single-link-accepts-a-one-entry-array

**T6510** — fixed. The lead case of two on the `link-cell-shape` runner; the
sibling is `link/multi-link-accepts-a-bare-object`.

## What the user sees

A script that has been writing rows for a year starts answering 400. Nothing
in the base changed, nothing about the values is wrong, and the field it fails
on is the one that connects two tables.

## Why

A link cell can hold one row or several, and v1 was tolerant about which shape
it was handed: an array with one entry where the field holds one row, a bare
object where it holds several. Clients written against v1 send those shapes,
and so do transitional realtime payloads.

v2's strict path rejected both. The tolerance was not a documented feature —
which is exactly why losing it is invisible until someone's integration breaks.

## Why strict rather than typecast

Typecast is the import path, and it is allowed to reshape what it gets. This is
the path an API client uses when it believes it is sending well-formed values,
which is where the tolerance was lost and where the 400 arrived.

## What the checkpoint asserts

The write succeeds **and** the cell reads back holding the linked row. A 2xx
that wrote nothing would be the same loss with a friendlier status. The cell is
also checked empty beforehand, so "the write landed" cannot be satisfied by
something that was already there.

The write goes through raw axios with the status left open: this is the request
that is refused before the fix, and the generated client throws on a non-2xx
and drops the response with it.
