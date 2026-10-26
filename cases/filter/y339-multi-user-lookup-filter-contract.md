# filter/y339-multi-user-lookup-filter-contract

**T6943 / Y339** — fixed by `358787f97`.

## What the user sees

A one-to-many link looks up a single-value User field. The resulting lookup is
multi-value, so a multi-value user filter must be accepted and return the
matching row.

## What the checkpoint asserts

The public field description marks the lookup as multi-value. Saving a
`hasAnyOf` filter succeeds, and reading the filtered view returns only the row
linked to the selected user.

## What the fixture has to hold

The runner creates a source User field, a host table with matching and
nonmatching rows, a one-to-many link, and the User lookup. It verifies the link
and both unfiltered host rows before the checkpoint.

One representative valid operator is enough to prove the client/server
contract. Exhaustively repeating every multi-value operator is outside this
atomic regression case.
