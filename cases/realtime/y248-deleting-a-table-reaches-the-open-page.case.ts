import { defineBugCase } from "../../framework/types";

// T6924: deleting a table changes what everyone currently looking at the base
// can still do. Nobody standing on that table was told. The sidebar refreshed,
// the list of tables the page keeps subscribed still carried the deleted one,
// and every request that page made came back "not found" - over and over, with
// nothing on screen saying why.
export default defineBugCase({
  id: "realtime/y248-deleting-a-table-reaches-the-open-page",
  title: "Deleting a table reaches the page that has it open",
  runner: "table-delete-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T6924",
    status: "fixed",
    sourceCommits: ["9ebd733db"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-table-delete-realtime",
    settleTimeoutMs: 20_000,
    announceTimeoutMs: 20_000,
  },
});
