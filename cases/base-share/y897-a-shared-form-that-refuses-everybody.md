# base-share/y897-a-shared-form-that-refuses-everybody

**T4612** — fixed.

## What the user sees

A shared form that silently refuses everybody. It is still shared, the link
still opens, and every submission fails. Nothing in the form's settings explains
it, because the setting that causes it has no screen.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Where the flag comes from

Whether a form accepted submissions was stored as a flag beside the fact that
the view is a form — the same thing said twice — and the settings endpoint let
anybody write it. Nothing in the product's own interface sends it; another tool,
a script or an assistant tidying up a view's share settings does. Once false,
there is no way back through the interface.

The fix removes the flag. A form takes submissions because it is a form.

## How the case is built

A form view, shared, and a submission from somebody with no session at all —
which is what filling in a public form is. Then the flag is written through the
settings endpoint, and the same stranger fills the form in again.

The first submission is the fixture check, outside the checkpoint: a refusal
afterwards means nothing unless the form worked to begin with.

## What the checkpoint asserts

The second submission succeeds. The error carries the status of the settings
write as well, so a run distinguishes "the flag was accepted and broke the form"
from "the flag was refused and something else broke it".

## Limits

One flag on one kind of view. The same commit also stops the form view seeding
the flag and drops it from the share popover, neither of which is observed here.
