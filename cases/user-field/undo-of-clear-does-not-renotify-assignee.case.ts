import { defineBugCase } from "../../framework/types";

// T6663: the same replay problem on the update path. Clearing a user cell and
// undoing writes the same person back, and the update projection saw an event
// whose source read 'user' - indistinguishable from someone typing the name in
// again. The guard reads the replay off the execution context, which is the
// only place it exists. Sibling of user-field/undo-of-delete-does-not-
// renotify-assignee.
export default defineBugCase({
  id: "user-field/undo-of-clear-does-not-renotify-assignee",
  title: "Undoing a cleared assignment does not notify the assignee again",
  runner: "user-field-notify-replay",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "fixed",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-replay-undoclr",
    replay: "undoClear",
    rowTitle: "assigned row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 5_000,
    replaySettleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
