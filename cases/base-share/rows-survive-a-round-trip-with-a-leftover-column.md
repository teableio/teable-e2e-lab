# base-share/rows-survive-a-round-trip-with-a-leftover-column

**T4988** — fixed.

## What the user sees

A migrated base that looks like their base, with rows missing.

Exporting and importing is how a base moves: onto another instance, into a
customer's space, out of a template. What travels is a dump of the table as it
is stored, and a table stored for a while has been edited — columns added,
renamed, removed. A removed column can leave its storage behind, invisible to
everyone, and the base most likely to have one is the base someone has been
living in for a year.

Rows were lost on the way back in. Not all of them and not with an error: the
import reports success, the tables are there, the columns are there, and the
count is short. Nobody counts rows after a migration.

## What the checkpoint asserts

Every row is in the imported copy, by name.

## What the fixture has to hold

The leftover column is invisible from the interface and every row is readable
before the export. If it showed up as a column this would be a different case;
if the rows had already gone, the checkpoint would be watching the wrong loss.

Three rows, so losing every row and losing some rows stay distinguishable.

The leftover column is made with SQL: no request produces one, and a table that
never had one cannot show the difference.

## Why the case waits

The import reports success before the rows have all landed, so the count is
polled rather than read once — otherwise slow would read as lost.
