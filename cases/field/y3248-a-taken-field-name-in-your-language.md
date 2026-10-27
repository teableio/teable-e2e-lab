# field/y3248-a-taken-field-name-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

Renaming a column to a name the table already has shows the refusal in
English on a Japanese (or any non-English) screen.

## What the checkpoint asserts

The rename (PATCH) answers 400 with
`data.localization.i18nKey = httpErrors.field.fieldNameAlreadyExists` and the
taken name as `context.name`, alongside the English message the page falls
back on.

Observed before #4020 (`73b3cd75d`): 400 "Field names must be unique" with no
translation key.

## What the fixture has to hold

A table with two text columns; the second is renamed to the first's name. The
request carries `Accept-Language: ja`, as a Japanese page sends it. Creating a
new field with a taken name is deliberately not checked: the product accepts
that and gives the new field a free name.
