import { defineBugCase } from "../../framework/types";

// T6663: restoring a record from the trash re-creates it with its user cell
// intact, which the old rule read as a fresh assignment. Undoing an accidental
// delete then notified everyone named in the rows it brought back - the same
// notification they had already received when the rows were first assigned.
export default defineBugCase({
  id: "user-field/trash-restore-does-not-renotify-assignee",
  title: "Restoring a deleted record does not notify the assignee again",
  runner: "user-field-notify-replay",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "fixed",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-replay-restore",
    replay: "trashRestore",
    rowTitle: "assigned row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 25_000,
    replaySettleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
