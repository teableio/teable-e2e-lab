import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y471-y472-y478-y492-conditional-rollup-keeps-nested-or",
  title: "Conditional rollups keep a nested OR group inside their condition",
  runner: "conditional-rollup-nested-or-matrix",
  timeoutMs: 300_000,
  bug: {
    issue: "T7080",
    status: "fixed",
    sourceCommits: ["bfd2d978b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y471-y492-nested-or",
    coveredCaseIds: ["Y471", "Y472", "Y478", "Y492"],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
