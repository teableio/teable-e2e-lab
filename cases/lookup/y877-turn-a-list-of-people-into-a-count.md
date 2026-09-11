# lookup/y877-turn-a-list-of-people-into-a-count

**T7144** — fixed.

## What the user sees

A summary column over a linked people column, listing the distinct people. The
same menu that offered that list offers "how many", and picking it is refused:
an error the dialog does not explain, and a column that stays as it was. The
way out is deleting the column and building it again.

## What was measured

On the fix's parent `2c9ebe653` the change is refused with `400 Invalid
RollupField formatting` (`validation_error`, domain code `validation.invalid`)
and the column stays a list of words. On `764aee642` — after the fix, before
the date-group one — and on `develop` it is accepted and the row reads 2. Run 34559846298.

## Why the edit carries formatting

Going from a list to a count changes what the column holds — words become a
number — and a number column needs number formatting, so the editor sends the
formatting along with the new expression. The new formatting was validated
against the result type the column had _before_ the edit, where numeric
formatting is not valid, and the whole request fell over on it.

## How the case is built

A source table whose rows all name the same person, a host row linked to two of
them, and a summary over that people column. Before the edit it answers with
the distinct people — a list of one. After it should answer 2.

Both linked rows naming the same person is deliberate: the distinct list and
the count are then different numbers, so a column that quietly kept its old
expression cannot pass by answering a plausible value.

## What the checkpoint asserts

Three things, because a refusal, a silent no-op and an accepted change that
never recomputes all look the same from the status line: the request is
accepted, the stored column read fresh says it is a single number, and the row
reads 2.

The convert request goes through raw axios with `validateStatus` so that a
refusal still carries its status, its body, and the routing headers into the
report — the openapi client drops all three on a non-2xx.

## Limits

One expression pair (`array_unique` to `countall`) over one source type. The
validation the fix moves is shared by every rollup expression change that
alters the result type; this is the shape the report came in as.
