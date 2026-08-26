import { defineBugCase } from "../../framework/types";

// T6662: v2 notified a user-field assignee for every record whose user cell
// arrived populated, and a CSV import into an existing table arrives that way
// for every row in the sheet. Importing an export of a table that already
// names people re-delivered every assignment in it as a fresh "you have been
// assigned" - notification and email - for work nobody had just handed out.
// v1 never notified on import; the fix reads the create's source and stays
// silent.
export default defineBugCase({
  id: "user-field/y191-import-does-not-notify-assignee",
  title: "Importing a sheet that names an assignee does not notify them",
  runner: "user-field-notify-bulk-action",
  timeoutMs: 300_000,
  bug: {
    issue: "T6662",
    status: "fixed",
    sourceCommits: ["01b1cd60d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-import",
    action: "import",
    controlRowTitle: "control-assignment",
    actionRowTitle: "imported row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 5_000,
    rowVisibleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
