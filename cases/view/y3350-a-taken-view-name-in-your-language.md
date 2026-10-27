# view/y3350-a-taken-view-name-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

Renaming a view to an existing view's name shows an English toast whatever
the person's language.

## What the checkpoint asserts

The rename answers 400 with `data.localization.i18nKey =
httpErrors.view.nameAlreadyExists` and the taken name as `context.name`.

## What the fixture has to hold

A table with its default view and a second one; the second is renamed to
the default view's name.
