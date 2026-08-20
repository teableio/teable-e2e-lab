# import/excel-duplicate-headers

**Bug:** T6855 — creating a table by importing an Excel file answered 500,
`PostgreSQL 42701: column already exists` (Sentry BACKEND-AI-1F5, five events
across two users).

## What broke

`POST /api/import/:baseId` was already marked for v2 by the routing guard. The
controller then narrowed that on its own: only `fileType=csv` was allowed
through, and Excel was pushed back with `v2Reason=unsupported_feature` and ran
v1's `createTableFromImport`.

v1 added the new table's columns in a single batch without making their
physical names unique. So a header row containing two names that fold to the
same column identifier produced two `ADD COLUMN` clauses with the same
identifier, and Postgres answered 42701. The whole import failed — no table,
no data, a 500 in the user's face.

Duplicate headers are not exotic in spreadsheets. Two empty header cells are
duplicates. So is any pair that differs only in case or punctuation, once it
has been folded into an identifier. The reporting events came from ordinary
sheets named `Sheet1`.

## Reproduction

All public API, and nothing leaves the machine:

1. Build a workbook whose header row repeats a name, and write it to a temp
   file.
2. Upload it through the product's own attachment path — signature, upload,
   notify — and take the presigned URL that comes back.
3. `POST /import/analyze` to read the sheet's columns.
4. `POST /import/{baseId}` to create a table from that sheet.

Before the fix, step 4 is answered by **v1** — `x-teable-v2=false`,
`reason=unsupported_feature` — which is where the 42701 came from in
production. After it, v2 serves the import, the table is created, and every
column has a distinct physical name.

Note precisely what the red column shows. The case refuses a v1 answer at the
routing assertion, so it stops before finding out whether that particular v1
import would have hit the collision. What it pins on the pre-fix side is the
**cause** — Excel falling back to v1 — and what it pins on the fixed side is
the **outcome** — v2 serving it and producing unique physical names. Neither
column reproduces the raw `42701` string, and a reader should not expect one.

## What the checkpoint asserts

That the import created a table, that no two fields share a `dbFieldName`, and
that no column was silently dropped to avoid the collision. The last one
matters: quietly discarding one of the duplicate columns would make the 42701
go away while losing the user's data, which is not the fix anyone wants.

The engine assertion sits **inside** the checkpoint here, deliberately, and for
a different reason than in
`lookup/null-multiplicity-scalar-converts`. Routing Excel to v2 _is_ the fix —
an import served by v1 is not a misconfigured harness, it is the bug. So a
non-v2 answer, and specifically `v2Reason=unsupported_feature`, is reported as
a reproduction rather than an error.

## Why the data looks like this

The header row carries a real collision and a control. `Amount` twice is the
collision: on the fixed side it comes back as `Amount` and `Amount_2`.

`status` and `Status` are the control, and they are deliberately left in even
though they do **not** collide — physical identifiers are quoted and therefore
case-sensitive, so both survive unchanged. That is worth asserting: it shows
the deduplication renames only what actually conflicts rather than mangling
every near-match, which would be its own kind of surprise for a user whose
sheet legitimately has both.

One data row, so the import exercises the data path rather than only the
schema — `importData: true` is where v1's batch column add ran.

The workbook is built in-process rather than checked in as a binary. A
committed `.xlsx` would be unreadable in review, and the thing under test is
the header row, which belongs in the case config where someone can see it.

The analyzer's column count is verified before the import. If the analyzer ever
collapsed the duplicates itself, the import would never be asked the question
this case exists for, and the case would pass without testing anything.
