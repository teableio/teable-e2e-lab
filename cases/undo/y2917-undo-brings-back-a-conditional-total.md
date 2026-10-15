# undo/y2917-undo-brings-back-a-conditional-total

**T7748** — fixed in `eeb2b08de`.

## What the user sees

A mistaken column delete, undone at once. The column and its values are back
and nothing is marked broken any more, but the lookup and the conditional
total built on it are both empty. Cleared error marks over empty cells read
as data rather than damage.

Observed before the fix (`6db59e39a`): undo answers `fulfilled`, neither
column has `hasError`, and both read `null`.

## What the checkpoint asserts

Undo answers `fulfilled`, and afterwards both the lookup and the
conditional total are healthy (no `hasError`) and hold what they held before
the delete: the linked amount and the sum of every positive amount.

## What the fixture has to hold

The delete is setup and is checked to have broken both columns, or there
is nothing for undo to repair. The total (60) differs from the linked amount
(10), so the two columns cannot be confused. The delete and the undo carry
the same window id, because the undo stack is keyed by it.
