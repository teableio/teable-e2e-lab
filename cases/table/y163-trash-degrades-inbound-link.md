# table/y163-trash-degrades-inbound-link

**Bug:** T6859 — trashing a table left link fields on other tables pointing at
it, and the record editor froze.

## What broke

v1 detaches inbound links as soon as a table is trashed: link fields on other
tables degrade to text, and lookups and rollups over them go into an error
state. v2 deliberately did not — `DeleteTableHandler` ran the cross-table
cleanup only for `mode === 'permanent'`, so a trashed table stayed fully
restorable.

What that bought was paid for by the tables the user still has. Their link
fields kept type `link` and kept pointing at a table nobody can open: the
record detail rendered the link section blank, "pick a record" froze, and the
grid could report `Cannot read properties of null (reading 'map')`. The fields
converted to text only after someone emptied the trash.

The fix runs the side effects on trash as well as on permanent delete.

## Reproduction

All public API:

1. Create a target table with one row, and a host table.
2. Create a two-way `manyOne` link on the host table pointing at the target,
   and create a host row linked to the target row.
3. `DELETE /base/{baseId}/table/{tableId}` on the target table — trash, not
   permanent.
4. `GET /table/{tableId}/field` on the host table.

Before the fix, the inbound link field is still `link` in step 4 and stays that
way; after it, the field is `singleLineText`.

## What the checkpoint asserts

That the inbound link field reaches `singleLineText` within the settle budget,
and that the host table still answers a record read once it has. The timeout is
the assertion here — the pre-fix behavior is not a wrong value but an absent
transition, so the case has to be able to say "never".

The trashing itself sits outside the checkpoint so its routing headers can be
asserted: the bug is in v2's delete handler, so it is this DELETE that has to
have been served by v2 (`x-teable-v2-feature: deleteTable`), not merely some v2
endpoint elsewhere. A delete that fails outright is re-thrown inside the
checkpoint — that is the product failing, not the fixture.

Also outside, as fixture verification: the link cell actually resolved to the
target row before anything was deleted. Without it, "the field never degraded"
and "there was nothing linked to degrade" would look the same.

## Why the data looks like this

One linked row is enough — the degrade is per field, not per cell.

The case asserts the field **type** only, never the text left behind in the
cell. v2 loses the cell value when it degrades a link to text (T6703, still
open, and the reason `table.e2e-spec.ts` skips that assertion under
`isForceV2`). Asserting on it here would make this case red for a bug it is not
about.
