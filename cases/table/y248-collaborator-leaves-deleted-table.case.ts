import { defineBugCase } from "../../framework/types";

// Y248 / T6924: a collaborator whose browser was open on a table deleted by
// someone else remained anchored to the dead resource and surfaced repeated
// not-found failures instead of recovering to a surviving table.
export default defineBugCase({
  id: "table/y248-collaborator-leaves-deleted-table",
  title: "A collaborator leaves a table after another actor deletes it",
  runner: "deleted-table-collaborator-recovery",
  timeoutMs: 240_000,
  bug: {
    issue: "T6924",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3149",
    sourceCommits: ["9ebd733db"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y248",
    settleTimeoutMs: 30_000,
    quietPeriodMs: 750,
  },
});
