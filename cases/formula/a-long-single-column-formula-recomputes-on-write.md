# formula/a-long-single-column-formula-recomputes-on-write

**T8631** — fixed in `f8859f50a`.

## What the user sees

A long formula is created and shows its values, but adding a row or editing the column it reads fails afterwards.

## What the checkpoint asserts

With a formula of 110 `ENCODE_URL_COMPONENT({Name} & "<i>")` terms, nested as three CONCATENATE groups of 50, 50 and 10, creating a row and changing the existing row are both accepted, and both rows read the exact concatenation of the 110 encoded values.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with one text column and one row. The formula is created in setup and must fill in for that row before the checkpoint runs.
