# attachment/y3370-a-refused-attachment-link-is-a-client-error

**T8057** — fixed in `65a568d55`.

## What the user sees

Adding a file by link fails with a generic server error when the link is expired or private, instead of saying the link was refused.

## What the checkpoint asserts

Uploading from a URL the remote server answers with 403 responds with a 4xx, not a 500.

## What the fixture has to hold

A file server started inside the run on a local port, refusing one path and serving another, and a table created for the run in the seed base (dropped afterwards). Attaching the served URL must succeed first.
