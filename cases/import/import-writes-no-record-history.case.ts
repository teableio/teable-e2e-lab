import { defineBugCase } from "../../framework/types";

// T6524: record history is the "who changed this cell, and from what" trail.
// Creating a record through the product writes none of it - a new row has no
// previous value to record - and importing is creating rows. The import wrote
// one null-to-value entry per non-empty cell anyway: rows times columns of
// write amplification, so a 10000 x 20 import is 200000 history entries nobody
// asked for, slowing the import that produces them and padding the history a
// person later scrolls through.
export default defineBugCase({
  id: "import/import-writes-no-record-history",
  title:
    "Importing a sheet writes no record history, the way creating rows does not",
  runner: "import-record-history",
  timeoutMs: 180_000,
  bug: {
    issue: "T6524",
    status: "fixed",
    sourceCommits: ["45828597b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-import-history",
    mode: "newTable",
    importedRows: 3,
    settleTimeoutMs: 15_000,
    pollIntervalMs: 500,
  },
});
