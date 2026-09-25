# realtime/a-batch-of-links-arrives-with-titles

**T7548** — fixed. On the `link-title-realtime` runner, under the hybrid
computed-update strategy.

## What the user sees

A script matches 153 engagement rows to their posts and writes the links in
one batch, giving only each post's id. For everyone with the table open, the
link column then reads "Untitled" on every row, while the column borrowed
through the link beside it shows the post text. Refreshing fixes it: the live
update sent each link as the id it was given, without the title the server
knew.

## What the checkpoint asserts

A client subscribed to one engagement row - the same socket path a browser
uses - sees that row's link arrive as `{ id, title }` within the settle
timeout.

## Why the fixture is shaped this way

153 rows written in one batch by id only, with a column borrowed through the
link, as in the report. The case runs under the hybrid strategy: the lab's
default deterministic one sends a full snapshot that hides the missing
titles. The batch update's routing headers prove v2 served it.

The borrowed column is recorded, not asserted. On the fix's parent it reached
the watcher; on the fix and on `develop` it had not reached the watcher by the
time the titled link did (runs 36125870798 and 36126294212, each within a
15 s wait). Whether that is slow or missing is a separate question from this
bug and was not investigated here.

## Evidence

Run 36126294212: on `63c9f3aaaa` (the fix's parent) the watched row showed
the link as `{"id":"recM5k8Qh3cha0pvDw1"}` with no title, the borrowed body
`"Body 0"` beside it; on `f6d0857a01` and `develop` (`37830698a4`) the link
arrived with `"title":"Post 0"`.
