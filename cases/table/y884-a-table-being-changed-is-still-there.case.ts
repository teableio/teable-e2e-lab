import { defineBugCase } from "../../framework/types";

// T6660: adding a column that needs the stored table rebuilt marks the table as
// being worked on and marks it ready again afterwards. Reads resolve tables by
// "ready", so a read arriving inside that window answered "Table not found" -
// what a deleted table answers - instead of waiting. One column is a narrow
// window; somebody adding several, or an assistant adding them in a burst,
// keeps it almost continuously open and everybody else's page reports a table
// that is plainly there as gone.
export default defineBugCase({
  id: "table/y884-a-table-being-changed-is-still-there",
  title: "A table being changed does not report itself missing",
  runner: "provision-window-read-race",
  timeoutMs: 300_000,
  bug: {
    issue: "T6660",
    status: "fixed",
    sourceCommits: ["68714edef"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-provision-window",
    rowCount: 20,
    columnsToAdd: 6,
    concurrentReads: 8,
  },
});
