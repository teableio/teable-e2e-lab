# plugin/y891-the-list-of-plugins-and-a-secret

**T6177** — fixed.

## What the user sees

Nothing, which is the shape of this kind of fault. Asking for the list of one's
own plugins returned, for each of them, the scrambled copy of its secret that
the product stores.

It is not the secret itself. It is also the one thing a stored credential must
never be: handed out on an ordinary read, to be worked on offline, by anybody
who can see that page — including anything embedded in it.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## How the case is built

One plugin registered through the public endpoint, then the ordinary list read.

Registration is allowed to carry the real secret — that is the single moment it
is meant to be shown — so it is read outside the checkpoint and kept. The
checkpoint then has something to compare against: a list showing the real secret
would be worse than a list showing the scrambled one, and both must fail.

## What the checkpoint asserts

For the plugin just registered, the list carries no secret at all, or a masked
one — mostly asterisks, which is the repaired shape. A value that is neither is
reported with its first characters, so whoever reads the run can see what kind
of thing travelled.

## Limits

The list read only. The same fix also stops the update response carrying it, and
covers plugin auth codes, token scopes and install lookups, none of which are
exercised here.
