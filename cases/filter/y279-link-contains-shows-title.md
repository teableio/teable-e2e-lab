# filter/y279-link-contains-shows-title

## Source

Y279 tracks T6936, fixed by
[teable-ee PR #3153](https://github.com/teableio/teable-ee/pull/3153)
at commit `85441ac71`. A link filter stores a record id for `is`, but stores
title text for `contains`. Switching between those operators kept the old
value, displayed an internal `rec...` id in the title input, and produced a
filter that did not express what the user selected.

## Fixture

Setup uses product APIs before browser interaction:

1. Create two linked records with distinct titles.
2. Create two host records and link each one to a different foreign record.
3. Save an `is` view filter containing the matching foreign record id.
4. Read the view through the public record API and prove v2 returns only the
   matching host record.
5. Open that grid in the Chinese locale and use its real filter panel in
   Chromium.

## Checkpoint

`link-is-to-contains-clears-record-id-and-filters-by-title` switches the real
operator control from `is` to `contains`. It asserts that the newly rendered
text input is empty instead of containing the old record id. The case then
enters the linked record title, waits for the filter save to answer 200, and
asserts both public effects:

- the visible input contains the exact title and never a `rec...` id; and
- a v2 view read returns only the host record linked to that title.

The fixture does not write a broken value directly. The operator switch that
used to preserve the incompatible value is performed by the browser inside
the checkpoint.

## Expected status

`status: fixed`. The checkpoint must reproduce at `85441ac71^` by displaying
the stale record id, and pass at `85441ac71` and later revisions.
