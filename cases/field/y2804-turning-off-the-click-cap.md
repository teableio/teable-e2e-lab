# field/y2804-turning-off-the-click-cap

**T7768** — fixed in `69e60e8ca`.

## What the user sees

After switching the click limit off, turning it back on later comes back
with "allow reset" already enabled and a stale cap behind it.

## What the checkpoint asserts

Clearing the cap (`maxCount: null`) with reset off answers 2xx from v2,
and the stored options carry no cap and `resetCount` not true.

## What the fixture has to hold

The button starts with a cap of 3 and reset on, checked before the
change. The observation is at the API, which is what the editor sends; before
the fix the cleared cap itself was refused, which is why the editor fell
back to storing 0.
