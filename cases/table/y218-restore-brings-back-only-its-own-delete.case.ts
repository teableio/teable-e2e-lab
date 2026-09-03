import { defineBugCase } from "../../framework/types";

// Restoring a table has to put back what the table's own delete took away, and
// nothing else. Deleting a table marks its fields and views deleted alongside
// it, so the restore looked for everything marked deleted - and took it all,
// including a column somebody had removed months earlier. What comes back is a
// table with a column nobody expected, holding whatever was in it when it was
// removed: on a table that has been tidied more than once, the restore undoes
// the tidying too.
export default defineBugCase({
  id: "table/y218-restore-brings-back-only-its-own-delete",
  title: "Restoring a table does not resurrect columns deleted before it",
  runner: "table-restore-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T6227",
    status: "fixed",
    sourceCommits: ["40d9d8017"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-restore-scope",
    backdateHours: 24,
    trashVisibleTimeoutMs: 30_000,
    pollIntervalMs: 500,
  },
});
