import { defineBugCase } from "../../framework/types";

// T6595: a view stores where each column sits. Tables older than that
// bookkeeping - or that lost entries along the way - have views listing only
// some of their fields, and the ones with no entry are exactly the columns
// nobody has ever moved. Appending derived the new column's position from the
// entries that exist rather than from the columns that exist, so the new field
// got a position already taken: it does not appear where it was added.
export default defineBugCase({
  id: "view/y206-added-field-lands-after-legacy-columns",
  title: "A field added to a view with sparse column metadata lands last",
  runner: "sparse-view-field-order",
  timeoutMs: 180_000,
  bug: {
    issue: "T6595",
    status: "fixed",
    sourceCommits: ["c9aef116b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-sparse-view-order",
    legacyFieldNames: ["Legacy A", "Legacy B"],
    addedFieldName: "Added",
  },
});
