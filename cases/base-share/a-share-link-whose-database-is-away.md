# base-share/a-share-link-whose-database-is-away

**T6926** — fixed. On the `share-view-unready-data-db` runner.

## What the user sees

Someone opens a share link. The space it belongs to is bound to a database whose
connection has been switched off — revoked credentials, a retired connection, a
migration part way through. The page fails with a 500.

Everything about the share is still correct: the link, the view, the permission.
There is simply nowhere to read the rows from.

The person holding the link is usually outside the company. They have no
account, no way to see anything else, and nobody to ask. A 500 tells them the
product is broken and there is nothing to do about it. A 503 naming an
unavailable database tells them, and anything watching the endpoint, that the
same page will work later.

## Why

Resolving which database a space reads from threw a plain error when the binding
was not usable. Nothing above it recognised that error, so it surfaced as an
unhandled 500 rather than as the outage it describes.

## What the checkpoint asserts

The status **and** the code. 503 alone would be indistinguishable from any other
outage, and being distinguishable is the whole of the fix — so the response must
also call itself `database_connection_unavailable`.

A 200 is called out separately, because a share link that answered normally
while its database was away would be a different and worse problem than the one
this case is about.

## Why the fixture is written with SQL

Binding a space to another database is not part of this observation, and a
connection in the switched-off state is not something a request can ask for.
`fixture-db` writes the two rows; the observation stays on the public share
endpoint.

Before the binding is written, the fixture opens the share link and requires a 200. Without that, a 503 afterwards could just as well mean the share was never
set up — and the case would pass while proving nothing.

The space is created for this case alone. The binding under test is a property
of a space, and this must not touch the one every other case reads from.

## The v1 column

Skipped, for a reason about this harness rather than about the product. The case
makes its own space and base — the binding under test is a property of a space —
and `framework/case-base.ts` unstamps only the base it manages. A base created
inside a runner is born on v2, so a v1 run answers

```
POST /table/{tableId}/view/{viewId}/enable-share was requested of v1
but v2 answered (reason=new_base)
```

which is the harness refusing to fabricate a reference column, not an answer
about v1. Any future runner that creates its own base inherits this.
