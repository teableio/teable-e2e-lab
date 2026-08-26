import { defineBugCase } from "../../framework/types";

// T6662: the same unconditional notify, reached through duplicating a table
// instead of importing into one. Every copied row re-delivers the assignment
// it was copied with, so duplicating a table of a few hundred assigned rows
// buried its assignees under a few hundred notifications for a table they had
// never been shown. Sibling of user-field/y191-import-does-not-notify-assignee, on
// the same runner.
export default defineBugCase({
  id: "user-field/y192-table-duplicate-does-not-notify-assignee",
  title: "Duplicating a table does not re-notify the people assigned in it",
  runner: "user-field-notify-bulk-action",
  timeoutMs: 300_000,
  bug: {
    issue: "T6662",
    status: "fixed",
    sourceCommits: ["01b1cd60d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-duplicate",
    action: "tableDuplicate",
    controlRowTitle: "control-assignment",
    actionRowTitle: "duplicated row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 5_000,
    rowVisibleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
