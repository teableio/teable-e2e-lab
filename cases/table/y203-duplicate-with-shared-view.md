# table/y203-duplicate-with-shared-view

**T6573** — fixed.

## What the user sees

A table cannot be duplicated. The request answers 500 and no copy appears. The
message says nothing about why, and the thing that made it impossible is that
somebody, at some point, turned on sharing for one of its views.

## Why

Sharing a view mints a credential that is unique across the whole instance —
it is the address of a public page, and the database enforces that with a
unique index. Duplicating a table copied every view exactly as it was, that
credential included, so the copy's insert collided with the original's.

The blast radius is larger than it sounds. Sharing is per view and it is
sticky: a view shared once for a demo months ago still carries its credential.
So "this table will not duplicate" arrives without any visible cause, on a
table that works normally in every other way.

## What the case asserts

Two things, and the second matters as much as the first.

The duplicate has to succeed. And the copy's views must not carry the source's
share id — a copy that reused it would be worse than the 500 it replaced: two
tables answering on one public address, where turning sharing off on either one
takes down a page the other is serving. A fix that made the insert succeed by
dropping the unique constraint would pass the first check and fail this one.

## How the case is built

One table, one view, sharing enabled through the endpoint the share button
calls, then a duplicate through the ordinary table duplicate route.

The duplicate request goes through raw axios with the status left open: this is
the request that is refused before the fix, and the generated client throws on
a non-2xx and drops the response — status, body and routing headers — with it.
