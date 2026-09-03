import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y465-ordinary-rollup-keeps-linked-record-identity",
  title:
    "Y465 ordinary rollups keep distinct linked records with the same title",
  runner: "rollup-link-identity-matrix",
  timeoutMs: 300_000,
  bug: {
    issue: "T7082",
    status: "fixed",
    sourceCommits: ["9e77be25f", "5820e4fa3"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y465-rollup-link-identity",
    coveredCaseIds: ["Y465"],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
