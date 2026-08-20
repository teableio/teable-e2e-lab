# table/y149-delete-single-submit

## Source

Y149 tracks T6827, fixed by
[teable-ee PR #3058](https://github.com/teableio/teable-ee/pull/3058)
at commit `701fc1547`. While a large table's delete request was pending, the
confirmation button showed no waiting state and remained interactive. Repeated
activation sent duplicate delete requests; after the first succeeded, a later
request surfaced a contradictory node-not-found error.

This automated case deliberately narrows the original compound manual case to
the defect's atomic prevention point: pending state and single submission. It
does not add cross-browser, failure-injection, trash-list, or backend-idempotency
contracts.

## Fixture

Setup completes before the checkpoint:

1. Create a fallback table and a target table through product APIs.
2. Seed deterministic rows and read them back through v2.
3. Open the target table in the real Next.js frontend and open its delete
   confirmation in Chromium.
4. Route the real public delete request through a deterministic hold. The
   request is not mocked: after the checkpoint releases it, it continues to
   the real Nest backend.

Holding the request provides the same user-visible pending interval as a large
table without making runtime depend on machine speed or an arbitrary data-size
threshold.

## Checkpoint

`pending-delete-is-loading-and-single-submit` runs while the first request is
held and asserts:

- the confirm button is disabled;
- the button contains a loading indicator; and
- forced repeated clicks plus Enter and Space still produce exactly one
  public-API DELETE request.

The request is released in `finally`, including when the bug reproduces, so the
fixture does not leave a permanently stalled operation.

## Expected status

`status: fixed`. The checkpoint must reproduce on `701fc1547^` because the
button stays enabled or duplicate requests are emitted, and pass at
`701fc1547` and later revisions.
