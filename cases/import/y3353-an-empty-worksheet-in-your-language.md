# import/y3353-an-empty-worksheet-in-your-language

**T7936** — fixed in `fd7ab2fc8`.

## What the user sees

Importing a workbook with an empty sheet reports the problem in English
whatever the person's language.

## What the checkpoint asserts

The import answers 400 with
`data.localization.i18nKey = httpErrors.import.excelSheetNoColumns`.

## What the fixture has to hold

A workbook built for the run with a single empty sheet, uploaded through the
product's own upload path.
