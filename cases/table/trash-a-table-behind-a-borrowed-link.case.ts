import { defineBugCase } from "../../framework/types";

// T7539: trashing a table that another table borrows through a chain of two
// many-to-one links refilled the borrowed single-value column with text the
// database refused. The delete failed, and the table then vanished - not in
// the list, not in the trash - with all its rows still there.
export default defineBugCase({
  id: "table/trash-a-table-behind-a-borrowed-link",
  title: "Trashing a table another table borrows through a link goes through",
  runner: "trash-behind-a-lookup-of-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T7539",
    status: "fixed",
    sourceCommits: ["fba1472dc"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-trash-behind-lookup",
    farRowTitle: "far-row",
    settleTimeoutMs: 30_000,
    pollIntervalMs: 500,
  },
});
