import { defineBugCase } from "../../framework/types";

// T8110: Duplicating a table with its records copies each view's row order,
// and the row-order column was created outside the duplicate's transaction,
// so duplicating a reordered table failed instead of producing a copy.
export default defineBugCase({
  id: "table/y3418-a-duplicated-table-keeps-its-row-order",
  title: "A duplicated table keeps its rows in the source view's order",
  runner: "duplicate-table-row-order",
  timeoutMs: 120_000,
  bug: {
    issue: "T8110",
    status: "fixed",
    sourceCommits: ["37035f224"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-row-order",
    rows: ["Row A", "Row B"],
    insertedBetween: "Row C",
  },
});
