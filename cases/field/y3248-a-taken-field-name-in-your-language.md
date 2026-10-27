# field/y3248-a-taken-field-name-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

Renaming a column to a name the table already has shows the refusal in
English on a Japanese (or any non-English) screen.

## What the checkpoint asserts

Both the rename (PATCH) and the create (POST) answer 400 with
`data.localization.i18nKey = httpErrors.field.fieldNameAlreadyExists` and the
taken name as `context.name`, alongside the English message the page falls
back on.

## What the fixture has to hold

A table with two text columns; the second is renamed to the first's name,
and a third is created with it. The request carries `Accept-Language: ja`, as
a Japanese page sends it.
