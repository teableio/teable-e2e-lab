import { defineBugCase } from "../../framework/types";

// T7748: undoing the delete of a source column brought the column and its
// values back and cleared the error marks on the lookup and the conditional
// total built on it, but neither was worked out again: both read empty.
export default defineBugCase({
  id: "undo/y2917-undo-brings-back-a-conditional-total",
  title: "Undoing a deleted column restores the conditional total built on it",
  runner: "conditional-rollup-undo",
  timeoutMs: 180_000,
  bug: {
    issue: "T7748",
    status: "fixed",
    sourceCommits: ["eeb2b08de"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-undo-conditional",
    amounts: [10, 20, 30],
    hostTitle: "host-1",
    settleAttempts: 20,
    settleIntervalMs: 500,
  },
});
