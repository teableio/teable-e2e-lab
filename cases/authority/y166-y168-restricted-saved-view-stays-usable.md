# authority/y166-y168-restricted-saved-view-stays-usable

**T6967 / Y166-Y168** - fixed.

## Why these IDs share one case

The three source rows describe the same incident from the account page,
personal-view, and public-view angles. The shipped defect was one saved view
query failing under an authority-matrix row mask. Splitting that contract into
three identical fixtures would add names, not coverage.

## Fixture proof

The runner creates three dated rows and a saved descending sort, then gives a
real second user a row filter that excludes the newest row. An owner read must
still see all three controls before the checkpoint.

## Checkpoint

The restricted session loads the saved sorted view and must receive the two
authorized rows in descending date order. It then loads the table's public
view and must receive the same authorized set without stale query state or an
error from the saved view.
