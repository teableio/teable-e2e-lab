# search/y164-multi-field-search-keeps-view-filter

**Y164 / T6916** - fixed.

## The bug

A Grid view had more than one saved filter. A field search over both a text
column and a date column could return a same-day row that failed another saved
filter. The search had enlarged the view instead of narrowing it.

The correct rule is an intersection: every returned row must satisfy every
saved View Filter **and** the field search.

## API reproduction

The case uses public APIs only:

1. Create a table with name, category and date columns.
2. Seed one row that satisfies both saved filters, one same-day row in the
   category the view excludes, and one kept-category row on another day.
3. Save an AND view filter for the target date and kept category.
4. Search the name and date columns together for the target date.
5. Read the records and row count through that saved view.

No browser state or manually recorded actual result is an input to the case.

## What is verified before the checkpoint

- A plain view read returns only the target-date, kept-category row. This
  proves both saved filters are active.
- The same multi-field search with the view ignored finds both target-date
  rows. This proves the excluded same-day row is a real leak candidate and the
  date search itself works.

If either premise is false, the fixture is rejected rather than reported as
the product bug.

## What the checkpoint asserts

With the saved `viewId` and multi-field search applied together:

- `getRecords` returns exactly the target-date, kept-category row by name;
- `row-count` returns exactly `1`; and
- the records request proves it was served by the v2 `getRecords` path.

Checking the exact row set matters. A count alone can be correct while naming
the wrong record, and a non-empty response can pass even when the view filter
has been bypassed.
