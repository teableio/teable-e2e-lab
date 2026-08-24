import { defineBugCase } from "../../framework/types";

// T4895: importing into a table that already exists is how a month's data
// arrives - the table and its worked-out columns are set up, and the rows come
// in from a spreadsheet. Nothing told those columns that new rows had arrived,
// so the imported rows carried the file's values and nothing else. A blank in
// a worked-out column reads as "nothing to work out here", so every total over
// that column is quietly short by exactly the imported rows.
export default defineBugCase({
  id: "import/appended-rows-get-their-computed-values",
  title: "Rows added by an import get their worked-out column too",
  runner: "append-import-computed",
  timeoutMs: 240_000,
  bug: {
    issue: "T4895",
    status: "fixed",
    sourceCommits: ["8e26aa66f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-append-import",
    existingRow: { ref: "already-here", amount: 100 },
    importedRows: [
      { ref: "imported-1", amount: 200 },
      { ref: "imported-2", amount: 300 },
    ],
    // A whole number: the product stores what the arithmetic gives, and 1.1
    // would make 100 into 110.00000000000001.
    multiplier: 2,
    settleTimeoutMs: 60_000,
    pollIntervalMs: 1_000,
  },
});
