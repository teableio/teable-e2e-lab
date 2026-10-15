# selection/y2900-paste-into-a-link-showing-another-column

**T7743** — fixed in `6afd67b0b`.

## What the user sees

The grid says "pasted" and the cell stays empty.

## What the checkpoint asserts

The paste-by-id is served by v2 and refused with 400 and the domain code
`paste.link_auto_create_requires_primary_lookup`; the far table keeps its
three rows and the link cell stays empty.

## What the fixture has to hold

A single-record link whose title column is a code column rather than the
primary one, and a pasted name that matches no row.
