# lookup/what-is-left-reaches-every-detail-row

**T7458** — fixed. On the `conditional-lookup-return-chain` runner, under
the hybrid computed-update strategy.

## What the user sees

A stock summary row links the detail rows that drew on it, totals their
draws and works out what is left. Every detail row looks that figure back up
by key. Entering draws of 5, 2 and 3, the summary moves on at once - 195, 193,
190 - but the detail rows show the figure from one draw earlier: 200 while the
summary says 195. Whoever enters a draw sees the stock as it was before they
entered it.

## What the checkpoint asserts

After each draw, within the settle timeout: the summary's used, left and
downstream figures are the new ones, and all 2000 detail rows show the new
"left" figure.

## Why the fixture is shaped this way

The fix's own structure and size: 2000 detail rows sharing one key, a summary
linking three of them, a rollup, two formulas on it, and a conditional lookup
on the detail rows. At this size the detail rows' refresh runs in the
background rather than inside the write, which is where the ordering went
wrong; the case runs under the hybrid strategy for the same reason. Outside
the checkpoint the case waits for 200 to be shown everywhere before the first
draw.

## Evidence

Run 36126298008: on `6d82e87d21` (the fix's parent), 60 s after drawing 5 the
summary read used 5, left 195, but all 2000 detail rows still read 200; on the
fix `85a36383be` and `develop` (`37830698a4`) every draw reached every row.
