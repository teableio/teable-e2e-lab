# authority/y386-restricted-grouped-grid-stays-readable

**T6993 / Y386** - fixed.

## Why this case includes a browser

The client must remove a group level whose field is not readable. Sending an
already-sanitized `groupBy` through an API would only prove the server accepts
good input, and would pass even if the real grid still sent the wrong group.

## Fixture proof

The runner creates deterministic category and status values, three records, a
two-level grouped view, a real second user, and one authority-matrix role.
Owner reads prove the rows and saved grouping exist before permissions are
applied. The role then makes category unreadable while leaving status readable.

## Checkpoint

The restricted browser opens the actual grouped grid. Its live subscription
must omit the unreadable category group, retain status as the first readable
group, receive every permitted row, and raise no page or socket error. The
mounted canvas must draw `Status` with the `closed` and `open` groups, never
`Category` as a group level. The public socket API must return every row with
the same depth-zero status headers.
