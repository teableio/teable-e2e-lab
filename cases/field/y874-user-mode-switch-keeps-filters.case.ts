import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "field/y874-user-mode-switch-keeps-filters",
  title: "User column mode changes preserve saved and already-open filters",
  runner: "user-mode-switch",
  timeoutMs: 300_000,
  bug: {
    issue: "T7213",
    status: "fixed",
    sourceCommits: ["324656c1c", "96ad3542b"],
  },
  config: {
    tableNamePrefix: "e2e-lab-y874",
    observation: "filters",
    settleTimeoutMs: 60_000,
  },
});
