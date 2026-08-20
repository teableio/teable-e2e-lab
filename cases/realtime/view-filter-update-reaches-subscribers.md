# realtime/view-filter-update-reaches-subscribers

**Bug:** T6608 — `Socket Error: internal server error: invalid / missing
instruction in op` when filtering a table.

## What broke

Updating the filter on a view that had no persisted filter emitted an event
whose previous value was `undefined`. The realtime projection forwarded it, and
the op it produced carried a path and nothing else once JSON serialized —
`{ p: [...] }` with no instruction. ot-json0 refuses that, so **every**
subscribed client threw. The user saw a Socket Error toast on entering or
filtering the table, and the filter appeared not to apply.

None of that reaches the caller. The `PUT` answers 200 before and after the
fix. The damage lives entirely in what the server pushes afterwards, which is
why this case subscribes as a client instead of reading the view back.

## Reproduction

1. Create a table with a text field and one row; take its default view.
2. Subscribe to that view's document as a client would.
3. `PUT /table/{tableId}/view/{viewId}/filter` with `null` — a clear on a view
   that never had a filter, which is the undefined-previous-value shape.
4. Set a real filter, then clear it again.

Before the fix, step 3's op arrives instruction-less and the client throws
`invalid / missing instruction in op`. After it, all three updates apply.

## What the checkpoint asserts

That the subscribed client applied every update and never errored — checked
after the first clear specifically, then again after the set and the second
clear.

The order is the point. A fix that only special-cased "clear a filter that was
never set" would leave the other transitions broken, and a case that only did
the first step would not notice.

Both halves matter: the document has to reach the expected state **and** no
error may have arrived instead. A client that errors on an op stops applying
them, so without the error check this would fail as a timeout that blames the
wrong thing.

## Why this case needs a subscribed client

This is the first case in the repository whose observation is not an HTTP
response, and the seam it introduced (`framework/realtime.ts`) is the mirror
image of `fixture-db.ts` — that one only writes and is banned inside a
checkpoint; this one only reads and belongs inside it.

It connects over SockJS the way a browser does, at
`/socket/<server>/<session>/websocket`, and frames messages by hand. Two
findings forced that, both worth recording because they are not obvious:

- A bare WebSocket upgrade to `/socket` is answered as ordinary HTTP 200 — that
  path is SockJS's handshake endpoint, not a socket.
- SockJS's raw endpoint (`/socket/websocket`) does connect, but arrives as
  `protocol: websocket-raw`; the gateway cannot recover the original request
  from it, falls back to headers without cookies, and the subscription is
  refused as unauthorized.

Framing by hand rather than using `sockjs-client` is also deliberate: that
client is written for browsers and offers no way to set a cookie header, which
is the one thing this connection cannot do without.

Going over the wire is not incidental to this bug either. The op that broke
was well-formed in memory and instruction-less only **once serialized**, so an
in-process subscription — which is what `ShareDbService.connect()` gives, since
that class is the sharedb _server_ — could miss it entirely.
