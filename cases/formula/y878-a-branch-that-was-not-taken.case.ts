import { defineBugCase } from "../../framework/types";

// T7122: "if there is no baseline, say so, otherwise say how far off we are".
// The rows with no baseline are exactly the ones the first branch is there for,
// and working out the second branch for them divides by zero. Both branches
// were worked out anyway and the error from the unused one was applied to the
// answer, so adding the column to a table that already held rows left those
// rows empty - or dropped the whole fill-in. The formula is accepted and
// nothing is flagged.
export default defineBugCase({
  id: "formula/y878-a-branch-that-was-not-taken",
  title: "A worked-out column answers the branch it took",
  runner: "formula-branch-error-backfill",
  timeoutMs: 240_000,
  bug: {
    issue: "T7122",
    status: "fixed",
    sourceCommits: ["4a4f14202"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-if-branch-alert",
    shape: "nested-alert",
    rows: [
      { name: "no-baseline", qty: 10, unitCost: 8, baselineUnitCost: 0 },
      { name: "up", qty: 10, unitCost: 12, baselineUnitCost: 10 },
      { name: "ok", qty: 10, unitCost: 9, baselineUnitCost: 10 },
      { name: "blank-qty", unitCost: 9, baselineUnitCost: 10 },
    ],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 2_000,
  },
});
