import { defineBugCase } from "../../framework/types";

// T1980: the trash is the promise that a delete is not final - it is what
// makes deleting a row an ordinary thing to do rather than a decision. Rows
// were not being written to it. The delete works and the row is gone, so there
// is nothing to notice until the day someone goes looking, and by then the row
// is not recoverable and nobody can say when it went.
export default defineBugCase({
  id: "record/a-deleted-row-in-the-trash",
  title: "A deleted row is in the trash",
  runner: "deleted-row-in-the-trash",
  timeoutMs: 180_000,
  bug: {
    issue: "T1980",
    status: "fixed",
    sourceCommits: ["4e1be01f7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-deleted-row-trash",
    deletedRowName: "the-deleted-row",
    keptRowName: "the-kept-row",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
