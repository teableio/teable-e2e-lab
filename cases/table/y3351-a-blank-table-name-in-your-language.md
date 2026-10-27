# table/y3351-a-blank-table-name-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

Clearing a table's name in the sidebar shows an English refusal whatever
the person's language.

## What the checkpoint asserts

Renaming the table's node to three spaces answers 400 with
`data.localization.i18nKey = httpErrors.table.nameRequired`, and the table
keeps its name.

## What the fixture has to hold

One table, renamed through the same node endpoint the sidebar uses; the
name is three spaces, which the endpoint trims to empty.
