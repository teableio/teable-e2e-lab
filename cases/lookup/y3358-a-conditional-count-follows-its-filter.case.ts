import { defineBugCase } from "../../framework/types";

// T8023: a conditional rollup filtering on computed multi-value fields was not
// refreshed when those computed values changed, so it disagreed with a freshly
// created rollup of identical configuration.
export default defineBugCase({
  id: "lookup/y3358-a-conditional-count-follows-its-filter",
  title:
    "A conditional rollup drops a row whose computed filter value leaves the match",
  runner: "conditional-rollup-filter-exit",
  timeoutMs: 180_000,
  bug: {
    issue: "T8023",
    status: "fixed",
    sourceCommits: ["79d454a16"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rollup-filter-exit",
    types: ["input", "choice", "compute", "failed-end"],
    expectedSource: "choice",
    expectedTarget: "failed-end",
    sourceTypeOutside: "input",
    settleAttempts: 20,
    settleIntervalMs: 500,
  },
});
