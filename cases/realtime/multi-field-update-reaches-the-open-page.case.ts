import { defineBugCase } from "../../framework/types";

// T4621: changing several cells of one row in a single edit sent the change
// out one cell at a time, and only some of them survived. The row in the
// database was right; the row in front of everyone else watching it was
// half-updated - and a half-updated row is indistinguishable from a row
// someone only half-edited, so nobody has a reason to refresh.
export default defineBugCase({
  id: "realtime/multi-field-update-reaches-the-open-page",
  title: "One edit of several cells arrives whole at the people watching",
  runner: "multi-field-update-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T4621",
    status: "fixed",
    sourceCommits: ["1aa082fb4"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-multi-field-rt",
    // Four cells: enough that losing some is unambiguous, and more than the
    // two where a loss and a reordering look alike.
    cellCount: 4,
    beforePrefix: "before",
    afterPrefix: "after",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
    pollIntervalMs: 250,
  },
});
