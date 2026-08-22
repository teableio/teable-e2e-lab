import { defineBugCase } from "../../framework/types";

// T6663: the notification rule was widened from "skip these two paths" to
// "only a person assigning you right now notifies". Duplicating a record was
// one of the paths that fell through the old list: the copy arrives with the
// user cell already filled, so the assignee was told a second time about work
// they already had. Nobody assigned them anything - a row was copied.
export default defineBugCase({
  id: "user-field/record-duplicate-does-not-renotify-assignee",
  title: "Duplicating an assigned record does not notify the assignee again",
  runner: "user-field-notify-replay",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "fixed",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-replay-dup",
    replay: "recordDuplicate",
    rowTitle: "assigned row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 25_000,
    replaySettleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
