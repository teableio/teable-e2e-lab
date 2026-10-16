# authority/y2800-a-viewer-can-press-a-button

**T7780** — fixed in `351faba83`.

## What the user sees

A read-only collaborator presses a button that runs a workflow and nothing
happens; the refusal ("You do not have permission to update rows") shows only
in the console.

## What the checkpoint asserts

The viewer's press is accepted and the row's count is 1; the viewer's
attempt to edit the row itself is still refused with 403.

## What the fixture has to hold

A real, active workflow behind the button (pressing a button with none is
refused for everyone), and a second person invited as a viewer for the
run.
