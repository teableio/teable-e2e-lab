import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y483-conditional-rollup-editor-wraps-lookup-conditions",
  title: "Y483 conditional rollup conditions stay editable over lookup sources",
  runner: "conditional-rollup-editor-browser",
  timeoutMs: 420_000,
  bug: {
    issue: "T7100",
    status: "fixed",
    sourceCommits: ["d88806650"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y483-rollup-editor",
    layout: "condition-rows",
    coveredCaseIds: ["Y483"],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
