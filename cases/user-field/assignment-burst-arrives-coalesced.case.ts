import { defineBugCase } from "../../framework/types";

// T6663: the other half of the same change. Silencing the paths that only move
// assignments around fixes the case where nobody assigned anyone. It does
// nothing for the case where somebody really did assign twenty rows in one
// sitting - filling in a sprint board, pasting a column of owners - and the
// person on the receiving end gets twenty notifications and twenty emails for
// one act of planning. The fix coalesces per actor and table: the first
// delivery goes out at once, the rest are merged into a single follow-up.
export default defineBugCase({
  id: "user-field/assignment-burst-arrives-coalesced",
  title:
    "A burst of assignments arrives as a couple of notifications, not one per row",
  runner: "user-field-notify-burst",
  timeoutMs: 300_000,
  bug: {
    issue: "T6663",
    status: "fixed",
    sourceCommits: ["9aac6f6f8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-burst",
    rowTitlePrefix: "assigned",
    // Six rather than two or three: the gap between the coalesced result and
    // the unbatched one has to be wide enough that a single stray delivery
    // cannot close it.
    burstSize: 6,
    // The fix's steady state is 2 - one immediate, one merged. Three leaves
    // room for the burst straddling a window boundary without leaving room
    // for six.
    maxNotifications: 3,
    // Comfortably past the 10s coalescing window, so the merged notification
    // has been delivered before anything is counted.
    settleAfterBurstMs: 20_000,
  },
});
