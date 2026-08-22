import { defineBugCase } from "../../framework/types";

// T6663: duplicating a record still notifies the assignee a second time, on
// develop as well as on the fix's parent. The fix set the duplicate's create
// source so the create projection skips it, and it does - but the same PR
// added a 10s window that coalesces notifications per actor and table, and
// something the duplicate does after the create still lands in that window.
// Pre-fix the notification arrives in 9ms; on develop it arrives in 9.7s,
// which is the window flushing. status is "open" for that reason: this case
// reproducing is the current state of the world, not a regression the lab
// introduced. See the case doc for how that was isolated.
export default defineBugCase({
  id: "user-field/record-duplicate-does-not-renotify-assignee",
  title: "Duplicating an assigned record does not notify the assignee again",
  runner: "user-field-notify-replay",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "open",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-replay-dup",
    replay: "recordDuplicate",
    rowTitle: "assigned row",
    notifyTimeoutMs: 20_000,
    // Longer than the other two on this runner: the notification this case
    // sees on develop arrives at the 10s coalescing flush, and a budget that
    // stopped before it would report a fix that is not there.
    quietTimeoutMs: 25_000,
    replaySettleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
