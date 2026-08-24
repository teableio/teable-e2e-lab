# field/a-value-too-long-to-be-a-choice

**T4138** — fixed.

## What the user sees

A column people have been typing into freely is turned into a set of choices —
the ordinary way to tidy one up, where each distinct value becomes an option.

One row has a paragraph in it. That paragraph becomes an option: it is in the
dropdown from then on, in the filter list, in the group-by list and in every
colour rule built on the column. Nothing about the conversion warned anyone,
and removing it afterwards means editing the column's settings past a page of
prose.

## What the checkpoint asserts

The conversion is refused **and** the column is exactly as it was: still text,
every row still holding what it held. The second half matters because the
person's next step is to shorten that one value and try again — a refusal that
half-converted the column would take that away.

## What the refusal looks like

Measured on `develop`: status 500, and the column untouched. The case asserts
the refusal and the untouched column, not the status code — but the 500 is
worth knowing, because a value the product deliberately rejects should not
answer like a crash.

## What the fixture has to hold

One value longer than the limit and two ordinary ones, so the refusal is about
that value rather than about the column. The runner reads the long value back
at its full length before converting, and refuses a fixture where the "long"
value is not actually over the limit.
