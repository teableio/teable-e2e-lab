# record/y175-legacy-unique-violation-names-field

**Bug:** T6758 — v2 `createRecords` answered
`Cannot complete insert: field  must have a unique value` on tables whose
unique index came from v1.

## What broke

v2 recovered the offending field from the Postgres constraint name, and
understood only the name it generates itself: `${table}_${column}_unique`. v1
named its unique indexes differently —
`${schema}_${table}___${fieldId}_unique`, lowercased and clipped to Postgres's
63-byte identifier limit. On any table whose unique index predates v2 the
parse matched nothing, the field came back `undefined`, and the message
rendered with an empty name where the field should be. No `details.fieldId`,
no `details.fieldName`, no localization payload — a bare English string with a
hole in it.

v1's contract had always carried the field (`Fields <fldId> unique validation
failed`, plus `httpErrors.custom.fieldValueDuplicate`), and integrations relied
on it. One external sync service used the conflict to recognise "this address
already exists" and take its fallback branch. Against the new shapeless
message it recognised nothing and retried — about a thousand times over six
hours. That table's create success rate was zero for two days, and the first
anyone noticed was a dashboard reporting no signups.

The fix reads Postgres's own `detail` (`Key (email)=(...) already exists.`)
before falling back to constraint-name parsing, and matches v1 field ids
case-insensitively.

## Reproduction

1. Create a table with a text field and one row.
2. Add a unique index over that column **named the way v1 named them** —
   `${schema}_${table}___${fieldId}_unique`, lowercased, clipped to 63 bytes.
   This is SQL, not API: see below.
3. `POST /table/{tableId}/record` with the same value again.

Before the fix, step 3 answers 400 with an empty field name. After it, the
error names the field.

## What the checkpoint asserts

That the duplicate was refused with a **4xx**, and that the response names the
field — either by name or by id. Either identifier is enough: the name is what
a person reads, the id is what an integration matches on. A rejection carrying
neither is the bug, because it is the same refusal with the one piece of
information the caller needed taken out of it.

The create goes out through raw `axios` with `validateStatus` open. The
generated client raises `HttpError` on non-2xx, which keeps the status and body
but drops the response and its routing headers — and this case is entirely
about a request that fails, so it is the only way to prove v2 served the call
under test.

## Why the data looks like this

The value is written once and then written again to collide with itself; its
content carries nothing.

The index is created with SQL because it is **history, not state**. v2 does not
name indexes this way any more, so the only tables carrying one are those that
lived through v1 — no sequence of API calls produces it today. This is the
`fixture-db` case the framework describes: build the past with SQL, observe the
present through the API.

The field's metadata is deliberately left without `unique: true`. A migrated
table carries the physical index whether or not v2's metadata agrees, and it is
the index that raises 23505 — which is the situation the report came from.
