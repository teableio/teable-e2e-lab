import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "link/y554-picker-keeps-selection-across-tabs",
  title: "A link picker keeps its saved row selected across tab switches",
  runner: "link-picker-tab-selection-browser",
  timeoutMs: 300_000,
  bug: {
    issue: "T7055",
    status: "fixed",
    sourceCommits: ["4b3a4e0cf"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y554-link-picker-tabs",
    selectedRowName: "Y3",
    otherRowNames: ["Y1", "Y2", "Y4"],
    switchCount: 10,
    settleTimeoutMs: 30_000,
  },
});
