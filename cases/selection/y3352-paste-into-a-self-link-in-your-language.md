# selection/y3352-paste-into-a-self-link-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

The paste fails with an English explanation, whatever the person's
language, for a refusal they can act on (paste an existing title instead).

## What the checkpoint asserts

The paste-by-id is served by v2 and answers 400 with
`data.localization.i18nKey = httpErrors.selection.linkAutoCreateSelfLinkUnsupported`,
and no row is created.

## What the fixture has to hold

One table with a many-many link to itself and one row; the pasted title
matches no row, so the product would have to create one in the same table.
