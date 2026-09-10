# Y873: user mode changes keep people visible

T7257. A user column switched between one person and several appeared empty
after a successful save. This case keeps one person per populated cell in
both directions: choosing which person to keep from a longer list is not the
question. Two populated rows, an empty row, and an untouched user column make
lost values distinguishable from an empty fixture or an unloaded table.

The fixture is created through public APIs. The checkpoint changes the mode
and checks field options, record values, the currently open grid, a newly
loaded grid, and record details. Browser checks are required: a correct API
response does not prove the person is still visible. Recorded canvas text is
cleared before the change so an earlier paint cannot satisfy a later check.

This is not a test of notification delivery, multi-person truncation, or every
field conversion. Both directions belong to one case and are reported even
when the first fails. Historical execution results are not assertion inputs.

Source fix: `9f107a3d2`. A local comparison on `fe00861c7` reproduced a
missing person in the already-open record detail when narrowing the column,
and a page error when widening it. The API values still existed. The same
case passed on `ce2629b2a`, including both live pages and fresh reads.
This distinction is why an API-only test would miss the reported defect.
