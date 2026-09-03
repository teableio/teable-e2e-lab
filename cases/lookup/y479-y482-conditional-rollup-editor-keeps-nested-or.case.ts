import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y479-y482-conditional-rollup-editor-keeps-nested-or",
  title:
    "Y479-Y482 conditional rollups keep nested OR controls across source types",
  runner: "conditional-rollup-editor-browser",
  timeoutMs: 420_000,
  bug: {
    issue: "T7084",
    status: "fixed",
    sourceCommits: ["3febed9a6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y479-y482-rollup-editor",
    layout: "group-header",
    coveredCaseIds: ["Y479", "Y480", "Y481", "Y482"],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
