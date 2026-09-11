# authority/y882-a-column-that-says-whether-progress-may-be-watched

**T7159** — fixed.

## What the user sees

Someone whose role shows them a filtered slice of a table opens it and gets
"this resource is restricted". They are allowed to read the table; the rows they
may see are there; the message is about something they never asked for.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## What is actually being refused

A worked-out column can take a while, and the page shows how far along it is by
subscribing to that column's progress. Watching progress is a separate
permission from reading the column, and for good reason: progress is counted
across every row, and this person may only see some of them.

The description the column arrived with did not carry that permission, so the
page had nothing to decide on and subscribed anyway. The server refused — and
the refusal did not stay contained: it failed the whole batch of columns the
page had asked for, which is why what lands on screen is a blanket restriction
message rather than a missing progress bar.

## How the case is built

The authority matrix on a base of its own, a role whose filter keeps one of two
rows from a second signed-in person, and a worked-out column over the column the
filter reads. Everything is built as the owner; only the restricted person's own
requests are inside the checkpoint.

Before the checkpoint the case requires that person to be able to read the table
and to see exactly the rows their filter allows. Without the first, every
assertion below would be about a table they cannot open; without the second they
are not restricted at all.

## What the checkpoint asserts

The column arrives carrying the permission as a real answer — not missing — and
that answer is "no". The same column read the way the page reads it on
reconnect says the same thing, because the page decides again every time it
reconnects. And their rows still carry the column's value: a build that stopped
the subscription by dropping the value would pass a case that only looked at the
flag, and would be a worse product.

## Limits

The message on screen is not observed here — that is the browser's rendering of
the refusal. What is observed is the description the page decides on, and the
values underneath it.
