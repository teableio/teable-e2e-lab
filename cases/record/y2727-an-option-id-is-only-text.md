# record/y2727-an-option-id-is-only-text

**T7826** — fixed in `5255dd724`.

## What the user sees

An id copied out of an export or an API response, written back, silently
selects an option — so the same text means different things depending on
whether it happens to match a hidden handle.

## What the checkpoint asserts

Without typecast the write is refused with 400, the cell stays empty and
the options are unchanged. With typecast the write answers 2xx from v2, the
cell holds the id as text, and an option of that name is added.

## What the fixture has to hold

Two rows, one per write, so the refused write and the converted one are
observed separately.
