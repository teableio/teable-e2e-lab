import { defineBugCase } from "../../framework/types";

// T6663: an undo replays the original request, so the event it publishes
// still says its source was a user - the only thing that knows better is the
// execution context. Undoing a delete therefore re-announced every assignment
// in the rows it restored. Sibling of user-field/undo-of-clear-does-not-
// renotify-assignee, which covers the update handler's half of the same guard.
export default defineBugCase({
  id: "user-field/undo-of-delete-does-not-renotify-assignee",
  title: "Undoing a delete does not notify the assignee again",
  runner: "user-field-notify-replay",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "fixed",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-replay-undodel",
    replay: "undoDelete",
    rowTitle: "assigned row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 25_000,
    replaySettleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
