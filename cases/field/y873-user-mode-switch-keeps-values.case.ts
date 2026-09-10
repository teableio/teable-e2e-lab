import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "field/y873-user-mode-switch-keeps-values",
  title:
    "Switching a user column between one and many keeps existing people visible",
  runner: "user-mode-switch",
  timeoutMs: 600_000,
  bug: {
    issue: "T7257",
    status: "fixed",
    sourceCommits: ["9f107a3d2"],
  },
  config: {
    tableNamePrefix: "e2e-lab-y873",
    observation: "values",
    settleTimeoutMs: 60_000,
  },
});
