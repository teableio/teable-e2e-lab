# Y874: existing user filters survive a mode change

T7213. A saved user filter could become invalid when its column changed
between one person and several. The save succeeded, then the view's record
request failed with `Invalid record condition operator for field`.

Each direction has an independent table with two matching rows and one empty
row. Positive and negative views are saved and verified before conversion.
The multiple-user direction uses the current-user token, while the other uses
an explicit user ID. Each populated cell contains only one person, keeping
the conversion lossless and the expected result set unambiguous.

The checkpoint changes the column, verifies the saved operator and operand,
and reads through the saved view, the newly read filter, and the original
filter still held by an already-open client. Every result must contain exactly
the expected IDs. Merely accepting the request, dropping the filter, or only
repairing the saved view is insufficient. The unchanged user column and the
unfiltered records are checked too.

Public APIs cover this behavior without browser interaction. This does not
claim to test warning dialogs for filters that cannot be mapped losslessly.
Source fixes: `324656c1c` and `96ad3542b`. On `fe00861c7`, both saved
positive filters retained their old operators after conversion. On
`ef3197e0a`, saved operators were repaired, but the original client filter
failed with `Invalid record condition operator for field` in both directions.
On `ce2629b2a`, both directions passed, including negative filters and old
client-supplied filters.
