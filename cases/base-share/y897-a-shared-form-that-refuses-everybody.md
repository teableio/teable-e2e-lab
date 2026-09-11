# base-share/y897-a-shared-form-that-refuses-everybody

**T4612** — fixed.

## What the user sees

A shared form that silently refuses everybody. It is still shared, the link
still opens, and every submission fails. Nothing in the form's settings explains
it, because the setting that causes it has no screen.

## What was measured

On the fix's parent `ff241c5d9` the settings write is accepted (200) and the
next submission answers `403 not allowed to submit` — the form is shared, the
link opens, and nobody can fill it in. On `develop` the same write is accepted
and the submission answers 201. Run 34580338734.

## Where the flag comes from

Whether a form accepted submissions was stored as a flag beside the fact that
the view is a form — the same thing said twice — and the settings endpoint let
anybody write it. Nothing in the product's own interface sends it; another tool,
a script or an assistant tidying up a view's share settings does. Once false,
there is no way back through the interface.

The fix removes the flag. A form takes submissions because it is a form.

## How the case is built

A form view with every field put on it, shared, and a submission from somebody
with no session at all — which is what filling in a public form is. The fields
have to be on the form and the submission has to name them by id: a form with
hidden fields refuses submissions outright, and the server decides what is
hidden by comparing the keys of what was sent against the ids on the form — so a
submission keyed by field name is refused the same way. Both stopped an attempt
before it could observe anything (runs 34579613695, 34579964949). Then the flag is written through the
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
