# lookup/y483-conditional-rollup-editor-wraps-lookup-conditions

**T7100** - fixed. Covers **Y483**.

## What the user sees

Condition rows in a narrow conditional-rollup field sheet do not wrap. Their
controls widen the nested group past the sheet, clip its add action, and lead
users to save a flattened condition with different results.

## How the case is built

The API creates a target table with text, number, date, boolean, and multi-value
fields, a source table that looks those values up through links, and a host
table with conditional rollups. Included, excluded, wrong-key, and empty-host
rows are in place before the checkpoint. The browser only opens the prepared
field and uses the nested-group action in the narrow editor.

## What the checkpoint asserts

Condition controls wrap inside the sheet, the nested-group add action remains
visible and usable, and the added row belongs to the nested group. API reads
then verify the lookup-backed rollups preserve the nested OR scope, value
shapes, multi-value expansion, and empty-host behavior.
