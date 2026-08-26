import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y340-user-lookup-survives-reread",
  title: "Y340: A recomputed user lookup survives a fresh read",
  runner: "lookup-user-recompute-reread",
  timeoutMs: 180_000,
  bug: {
    issue: "T6941",
    status: "fixed",
    sourceCommits: ["927f79fa2", "147f587d8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y340",
    sourceTitle: "source-owner",
    hostTitle: "work-item",
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
