import { defineBugCase } from "../../framework/types";

// DIAGNOSTIC, not for main. T6663's headline ask is that restoring a record
// from the trash must not notify. The lab measures no notification on the
// fix's parent either, which contradicts the code: before the fix the restore
// published its batch-created event with no source, and that defaults to
// 'user'. This run reads back what the restore actually wrote into the user
// cell, and whether a notification row exists at all, to tell "never created"
// apart from "created but not seen".
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
