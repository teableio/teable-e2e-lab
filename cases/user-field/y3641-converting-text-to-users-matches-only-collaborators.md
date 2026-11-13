# user-field/y3641-converting-text-to-users-matches-only-collaborators

**T8238** — fixed in `69e9cae86`.

## What the user sees

After converting a column of email addresses to a user field, a stranger who was never invited shows up in a cell with their name and avatar.

## What the checkpoint asserts

After the conversion, the collaborator's row holds the collaborator and the outsider's row is empty.

## What the fixture has to hold

A person signed up for the run and never invited anywhere, and a table created for the run in the seed base (dropped afterwards) whose text column holds the seed user's email and the outsider's email.
