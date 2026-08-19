import { defineBugCase } from "../../framework/types";

// Ported from teable-api-lab's record/update-100-mixed acceptance case. The
// failure class it exists to catch is "the update answered 200 and only part
// of it landed" — invisible to status codes, row counts, and sampling; only a
// full per-cell scan sees it. The same four field types and the same
// revision-value formula as the original, so a failure here is about updating,
// not about the data model.
export default defineBugCase({
  id: "record/bulk-update-100-mixed-lands",
  title: "批量更新 100 行的每一个字段后，每一格都真的落库",
  runner: "record-flow",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/record-bulk-update-lands",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-record-bulk-update-100",
    fields: [
      { name: "Title", type: "singleLineText" },
      { name: "Description", type: "longText" },
      { name: "Score", type: "number" },
      { name: "Active", type: "checkbox" },
    ],
    recordCount: 100,
    // 100 rows over four calls. A single-call update cannot express the
    // failure this case is about — "only part of it landed" needs more than
    // one part.
    batchSize: 25,
    mutation: {
      kind: "bulk-update-all-fields",
    },
  },
});
