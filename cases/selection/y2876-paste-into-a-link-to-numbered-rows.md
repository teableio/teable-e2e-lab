# selection/y2876-paste-into-a-link-to-numbered-rows

**T7759** — fixed in `6afd67b0b`.

## What the user sees

The paste fails with "Primary field must resolve to a single string value for
title resolution" — an internal-sounding message that names no column the
person could change. The real reason is that the far table's primary column
is a number the product fills in, so a new row cannot be named from the
pasted text.

Observed before the fix (`6db59e39a`): 400 with the domain code
`validation.invalid` and that message. No row was created and the cell stayed
empty, so the case pins the code rather than the data.

## What the checkpoint asserts

The paste-by-id is served by v2 and refused with 400 and the domain code
`paste.link_auto_create_computed_primary_unsupported`; the far table keeps its
one row and the link cell stays empty.

## What the fixture has to hold

A far table whose primary column is an auto number, with one row, and a
pasted name that matches nothing — so the product would have to create a row
it cannot name.
