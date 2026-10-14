import { defineBugCase } from "../../framework/types";

// T7798 / Q2-15: copying a row is an ordinary create for notification
// purposes, so the person the copy names in a user field with "notify when
// selected" has to be told - the same as if someone had typed their name in.
// This case asserted the opposite once. T6905 silenced the one-row copy, on
// the reasoning the bulk paths (T6662) were fixed with; Q2-15 settled that
// only bulk movement stays silent, and teable-ee#3929 narrowed the
// create-source whitelist so a copy notifies. The case now asserts the
// delivery, and the id keeps T6905's slug because renaming a case changes the
// identity the comparison, the tracker sync and the filter select on.
export default defineBugCase({
  id: "user-field/y573-record-duplicate-does-not-notify-assignee",
  title: "Copying a row notifies the person assigned in it",
  runner: "user-field-notify-bulk-action",
  timeoutMs: 300_000,
  bug: {
    issue: "T7798",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3929",
    // The PR head until the merge commit is known.
    sourceCommits: ["8bfe7c580e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-record-copy",
    action: "recordDuplicate",
    // Longer than the window assignments to the same person are folded
    // together in, so the copy's own notification cannot merge into the
    // assignment's and go unseen.
    coalescingWindowMs: 15_000,
    controlRowTitle: "control-row",
    actionRowTitle: "copied-row",
    notifyTimeoutMs: 20_000,
    observationTimeoutMs: 5_000,
    rowVisibleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
