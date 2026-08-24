import { defineBugCase } from "../../framework/types";

// T5585: creating a table is several steps, and when one fails the table is
// left marked as broken. Delete looked for a working table, did not find one,
// and refused - so the half-made table stays in the sidebar, cannot be opened
// and cannot be removed. The only way out for the user was to ask someone with
// database access.
export default defineBugCase({
  id: "table/delete-a-table-whose-creation-failed",
  title: "A table whose creation failed can still be deleted",
  runner: "delete-error-state-table",
  timeoutMs: 180_000,
  bug: {
    issue: "T5585",
    status: "fixed",
    sourceCommits: ["2e8e738e8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-error-table",
  },
});
