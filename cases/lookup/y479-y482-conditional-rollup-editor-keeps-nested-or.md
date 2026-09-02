# lookup/y479-y482-conditional-rollup-editor-keeps-nested-or

**T7084** - fixed. Covers **Y479, Y480, Y481, and Y482**.

## What the user sees

In the narrow conditional-rollup field sheet, the action for adding a
condition inside a nested OR group is clipped outside the editor. Adding the
second branch from the root instead saves a different AND condition and
changes which source rows are summarized.

## How the case is built

The API creates target, source, and host tables before the checkpoint. Source
rows provide user, attachment, linked-record, and formula values. Included,
excluded, wrong-key, and empty-host rows make the nested condition boundaries
observable. The browser opens one prepared conditional-rollup field only to
exercise the nested-group action in the same 400-pixel sheet.

## What the checkpoint asserts

The nested-group add action remains inside the visible sheet and adds a row to
that group. API reads then confirm the nested OR remains scoped under the key
match: the two included rows contribute to user and attachment counts, linked
records with the same title stay distinct, formula values total correctly,
and unmatched hosts stay empty.
