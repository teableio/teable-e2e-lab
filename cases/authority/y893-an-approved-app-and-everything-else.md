# authority/y893-an-approved-app-and-everything-else

**T6285** — fixed.

## What the user sees

The approval screen when connecting an app, and nothing afterwards. It lists
what the app is asking for, and that list is the whole of what anybody is
agreeing to.

One permission was granted regardless of that list: the ability to list every
base the approving person can reach. An app approved for one narrow thing could
enumerate the account, and neither the approval screen nor anything later shows
it.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## How the case is built

An app registered with one scope, then the approval done the way a person does
it — the authorize screen, the decision, the code, and the exchange for a token.

The token is then used the way a real app uses it: a bare HTTP client with no
session, carrying only the bearer token. Using the lab's signed-in client would
prove nothing, because that session can list bases on its own.

Before the checkpoint the token is used for something any working token can do
and must succeed. A token that works nowhere would be refused everywhere, and
the refusal this case is about would mean nothing. A first attempt used an
endpoint the consented scope does not cover and was refused on both columns —
an error, not an observation (run 34573492395).

## What the checkpoint asserts

The same token is refused for listing every base — and refused with the status
the fix answers, rather than any refusal at all: "refused for some other reason"
is worth seeing rather than passing.

## Limits

One scope and one endpoint beyond it. The same commit also fixes attachment path
traversal — `attachment/y892-where-an-upload-lands` — and notification XSS, which
is a browser-rendering fault and is not covered here.
