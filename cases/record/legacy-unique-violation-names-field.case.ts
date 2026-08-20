import { defineBugCase } from "../../framework/types";

// T6758: v2 read the offending field out of the PG constraint name and only
// understood its own form, `${table}_${column}_unique`. v1 named its unique
// indexes `${schema}_${table}___${fieldId}_unique`, so on any table whose
// index predates v2 the parse produced nothing and the 400 rendered as
// `Cannot complete insert: field  must have a unique value` - no field name,
// no details, no i18n. An external sync service that branched on the v1 error
// could not recognise it and retried ~1000 times over six hours; that table's
// create success rate sat at zero for two days.
export default defineBugCase({
  id: "record/legacy-unique-violation-names-field",
  title: "A unique violation on a v1-era index still names the field",
  runner: "legacy-unique-error",
  timeoutMs: 180_000,
  bug: {
    issue: "T6758",
    status: "fixed",
    sourceCommits: ["1bbc3c4cc"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-unique",
    duplicateValue: "duplicate@example.com",
  },
});
