# Y429: A department member appears in a shared user picker

**T6963** - fixed by `fc8702204`.

## What the user sees

A base can grant access to a department while the shared-view user picker lists
only direct user collaborators. A member whose access comes exclusively through
that department can work in the base but cannot be found or selected in a
shared form.

## Reproduction

The setup creates an organization-backed space, a department, and a user whose
base access comes only from that department. It grants the department access to
the base, creates a user field and a shared form, and verifies that the member
is not a direct base collaborator. The checkpoint calls the same public search
API used by the shared user picker.

## What the checkpoint asserts

Searching by the department member's display name returns that user's ID and
display name. The shared response must not expose email addresses.
