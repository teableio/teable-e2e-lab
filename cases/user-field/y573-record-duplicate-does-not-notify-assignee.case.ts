import { defineBugCase } from "../../framework/types";

// T6905: copying one row is the smallest version of moving an assignment
// without making it. The copy carries a user cell that was already populated
// and nobody is being assigned anything new, but the person was told again -
// so duplicating a handful of rows by hand rings someone's bell once per row,
// for work they already had. The bulk paths were fixed first; the one-row copy
// kept sending.
export default defineBugCase({
  id: "user-field/y573-record-duplicate-does-not-notify-assignee",
  title: "Copying a row does not notify the person assigned in it",
  runner: "user-field-notify-bulk-action",
  timeoutMs: 300_000,
  bug: {
    issue: "T6905",
    status: "fixed",
    sourceCommits: ["2d5ca188e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-record-copy",
    action: "recordDuplicate",
    // Longer than the window assignments to the same person are folded
    // together in, so the copy's notification cannot merge into the
    // assignment's and vanish.
    coalescingWindowMs: 15_000,
    controlRowTitle: "control-row",
    actionRowTitle: "copied-row",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 5_000,
    rowVisibleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
