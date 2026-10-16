# field/y2903-unnamed-computed-columns-keep-their-names

**T7744** — fixed in `12227acb9`.

## What the user sees

A script that creates a conditional rollup and then looks it up by its
usual default name no longer finds it.

## What the checkpoint asserts

A link, lookup, rollup, conditional rollup and formula created without a
name are called, respectively: the foreign table's name, `Price (from …)`,
`Price Rollup (from …)`, `Price Reference (…)` and `Calculation`.

## What the fixture has to hold

The four columns that were named correctly are the control: a change that
renamed everything would fail them.
