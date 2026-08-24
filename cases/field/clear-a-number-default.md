# field/clear-a-number-default

**T6107** — fixed.

## What the user sees

A number column fills new rows in with a value — a quantity that starts every new row at 1. Taking that default away is
refused: the dialog will not save. The only way out is to delete the column and
build it again, which takes its data and everything pointing at it along.

Setting a default and removing it is one setting used twice. Only text columns
accepted the second half.

## What the checkpoint asserts

Three things in order: the request is accepted, the column no longer carries a
default, and a row created afterwards arrives empty. The last one is the point
of the setting — a build that answered 200, cleared the setting and kept
filling rows in would be the same problem with a friendlier dialog.

## What the fixture has to hold

A row is created before the edit and has to come out filled in. If the default
were not being applied in the first place, an empty row afterwards would prove
nothing.

## Its siblings

`field/clearing-a-checkbox-default-saves` is the same edit on a checkbox, from
a different fix. The other two columns from this one are
`field/clear-a-number-default`, `field/clear-a-date-default` and
`field/clear-a-select-default`.
