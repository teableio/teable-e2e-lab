# Y422-Y428: Field options survive unrelated edits

**T6956** - fixed by `ed1dc355a`.

Covered case IDs: Y422, Y423, Y424, Y425, Y426, Y427, and Y428.

## What the user sees

The field editor reads a complete field description and submits that
description when a person changes an unrelated property. Some descriptions
omitted existing options, so an ordinary edit could silently clear display,
choice, default, relationship, or computed-field configuration.

## Reproduction

The case creates one table and a representative matrix of configurable fields.
The setup includes text display modes, select choices, defaults, number and date
formats, rating settings, tracked fields, a link, and a rollup. The checkpoint
uses the options returned by the public API, performs name-only and explicit
option round trips, and reads every field back.

The matrix is intentionally one case. Y422-Y428 describe the same API contract,
and splitting the same fixture into seven runners would add repeated setup
without adding a distinct product trigger.

## What the checkpoint asserts

Every field keeps its identity, type, and configured options through both an
unrelated edit and an explicit option resubmission. The Markdown entry is the
historical discriminator: before the fix the API omits that setting, while the
fixed revision reports and preserves it. The remaining entries protect the
same option-preservation contract across the field families named by Y422-Y428.
