import { defineBugCase } from "../../framework/types";

// T6238: field ids, like record ids, only had their prefix enforced in v1, so
// imported and migrated bases carry ids whose body is not the length v2
// generates. v2 parsed them strictly. A field id is part of every query built
// against its table, so the blast radius is a table rather than a row: one
// unparseable field and nobody can read it.
export default defineBugCase({
  id: "field/y216-legacy-field-id-table-still-works",
  title: "A table holding a pre-migration field id still reads and writes",
  runner: "legacy-field-id",
  timeoutMs: 180_000,
  bug: {
    issue: "T6238",
    status: "fixed",
    sourceCommits: ["dfe71c888"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-field-id",
    legacyFieldId: "fldLegacy",
    seedValue: "before",
    updatedValue: "after",
  },
});
