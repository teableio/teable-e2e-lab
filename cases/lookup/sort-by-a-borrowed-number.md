# lookup/sort-by-a-borrowed-number

**T7536** — fixed. On the `lookup-number-sort` runner.

## What the user sees

A number column borrowed from another table through a link. Sorted ascending,
2, 5, 12, 13 and 22 come back as 12, 13, 2, 22, 5 - the order of the digits
read as text. The column shows numbers, and the column it borrows from sorts
them as numbers.

## What the checkpoint asserts

Sorted ascending by the borrowed number, the rows come back in numeric order.
When they do not, the failure says whether the order it got is the text order,
which is what this bug looks like.

## Why the fixture is shaped this way

The amounts are chosen so the two readings disagree: as text "12" comes before
"2" and "22" before "5". The runner refuses amounts that sort the same both
ways, since a text sort would then pass.

The link is many-to-many, as in the report, so the borrowed column holds a
list even though each row links exactly one source row. That list is the shape
the sort mishandled.

Outside the checkpoint the case checks every row borrowed exactly the number of
the source row it links. An empty borrowed cell would be sorted for a
different reason.

The same report described a second symptom - grouping by a borrowed link column
ordered the groups wrongly. This case covers the sort only.

## Evidence

Run 36120798558: reproduced on `ec8e89872c`, `acd982aceb` and `5d9c3547b3` (the fix's parent) as 12, 13, 2, 22, 5 - the text order - and absent on `292b76bfff` and `develop` (`37830698a4`).
