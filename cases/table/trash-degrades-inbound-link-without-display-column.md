# table/trash-degrades-inbound-link-without-display-column

**T6880** — fixed. Sibling of `table/trash-degrades-inbound-link` (T6859), on
the same runner.

## The bug

Trashing a linked table converts every inbound link field to text. The
conversion's first step renamed the link field's physical column to a temporary
name — unconditionally. If that column was not there, the rename failed, and it
took the whole schema update with it.

What that looks like depends on which way the update was reached. Through the
async repair path it is a `table.update` operation that retries until it is
dead, leaving the host with a Link field pointing at a table nobody can open —
the delete having answered normally, so nothing says the base is now broken.

What this lab observes on the fix's parent is the blunter half of the same
failure: the delete answers **500**, with
`Failed to update table schema: error: column "Target" does not exist`, and the
target table does not go to the trash at all.

Either way the operation cannot complete, and the user is left with a link
between two tables that cannot be separated.

## Why a column would be missing in the first place

Not through anything a user can type. A link field's metadata and its physical
column are written by the same schema operation, and a base ends up with one and
not the other when an earlier operation failed part-way — which is the same
family of failure this one is in. That is why the repair path exists at all, and
why the fix also had to let the repair handler run when the related table is
already on its way out.

So the fixture is written straight to the database, through
`framework/fixture-db.ts`: setup only, outside the checkpoint, and the runner
re-reads `information_schema` afterwards to refuse a fixture where the drop did
not take. Without that guard this case would quietly become a second copy of its
sibling and report green for a reason that has nothing to do with T6880.

## What the checkpoint asserts

The same three things as the sibling, in the same order:

1. The delete answered 2xx. This assertion is inside the checkpoint on purpose:
   a refused delete is the product failing, not the fixture, and it is what the
   pre-fix column actually trips on.
2. Within the settle budget, the inbound link field's type reads
   `singleLineText`. The budget **is** the assertion — before the fix the field
   stayed a Link until someone emptied the trash, which is to say forever.
3. The host table still reads. A field that converted by taking the record read
   down with it would pass a type check alone, and here that risk is real: the
   conversion has to end with a text column the table did not have when it
   started.

The field type only, never the text left in the cell — v2 loses the cell value
in the degrade (T6703, open), and asserting on it would make this case red for a
bug it is not about.

The delete is issued with raw axios and the status left open. The generated
client throws away the whole response — routing headers included — the moment a
request answers non-2xx, which would report "the engine that served it cannot be
established" for a delete the product had just answered, and turn the
reproduction into a broken case. That is exactly what the first run of this case
did.

## Order of operations

Read the link, then drop the column, then trash the target. The order is
load-bearing in both directions: reading the link first is what proves there was
something to degrade, and it is the last moment that row can be read at all —
once the column is gone, so is the ability to select it.

## Why this shares a runner with its sibling

Everything the two cases build, and every assertion they make, is identical. The
difference is one fixture step and the shape of the link. Two runners would mean
two copies of the settle loop, the routing proof, and the cleanup, drifting
apart at whichever one someone edits next.

The two config flags are required rather than defaulted, so both cases state
which shape they are: `manyOne` with the column present, `oneMany` with it
dropped. `oneMany` because that is where the reported reproduction lives — the
host's link column holds a JSON array of display titles, and it is that column
the fixture takes away.
