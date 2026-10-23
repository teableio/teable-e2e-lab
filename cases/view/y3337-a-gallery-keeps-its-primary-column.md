# view/y3337-a-gallery-keeps-its-primary-column

**T7979** — fixed in `8fc9df7cd`.

## What the user sees

A gallery view is suddenly empty: the rows are there, the cover images
are there, and no card is drawn, with nothing saying why.

## What the checkpoint asserts

The column-meta update answers 2xx from v2; afterwards the primary column
is still visible, the other column in the same request is hidden, and the
cover column is unchanged.

## What the fixture has to hold

The same request hides a second column as a control, so a fix that refused
the whole batch would fail; the gallery has an attachment cover as in the
report.
