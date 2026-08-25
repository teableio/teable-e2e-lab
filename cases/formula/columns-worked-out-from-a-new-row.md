# formula/columns-worked-out-from-a-new-row

**T1506** — fixed.

## What the user sees

The row they just typed is the one row where these columns are blank.

"How long has this been open", "who entered it", "what is its reference number"
— these are the columns a table uses to keep track of itself. The product fills
the underlying values in as the row is created, so a column that reads them has
everything it needs at that moment.

They came back empty. The values appear later, or on the next reload, which is
exactly when nobody is looking any more.

## What the checkpoint asserts

All three worked-out columns come back with a value on the row that was just
added: nothing blank, zero days open, and a reference number of its own.

## Why the answer to the write is what is read

That is the row the person is looking at. Reading the row again afterwards
would ask a different question — one the product has always answered correctly.

## What the fixture has to hold

The three columns the formulas read are the kinds they are meant to be. A
formula over a column of the wrong kind would be blank for a reason that has
nothing to do with this.
