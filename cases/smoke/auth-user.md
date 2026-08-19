# smoke/auth-user

## What this is

A sentinel case (`sentinel/`), tied to no historical bug. What it asserts is
that **the harness itself is trustworthy on this revision**: injection worked,
the Nest app came up, the seeded user's session is valid, and the checkpoint
and verdict mapping do what they claim.

If the sentinel reads 💥 or ❌ in some column of the comparison table, do not
trust any other cell in that column.

## Reproduction

`GET /api/auth/user` (`USER_ME`), carrying the seeded user's session cookie.

## What the checkpoint asserts

- The response is 200.
- Its `id` and `email` match the e2e seed user (`test@e2e.com`).

## Expected status

`status: fixed`. The correct behavior has to hold; failing to observe it on any
revision is a regression.
