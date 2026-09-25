import { defineBugCase } from "../../framework/types";

// T7458: a summary totals the draws of the detail rows it links and works out
// what is left; every detail row looks that figure back up by key. After each
// draw the summary moved on and the detail rows showed the figure from one
// draw earlier. Only under the production (hybrid) computed-update strategy.
export default defineBugCase({
  id: "lookup/what-is-left-reaches-every-detail-row",
  title: "What is left reaches every detail row after each draw",
  runner: "conditional-lookup-return-chain",
  timeoutMs: 600_000,
  computedUpdateMode: "hybrid",
  bug: {
    issue: "T7458",
    status: "fixed",
    sourceCommits: ["85a36383b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-what-is-left",
    key: "Group A",
    detailCount: 2000,
    seedBatchSize: 500,
    linkedCount: 3,
    total: 200,
    draws: [5, 2, 3],
    readPageSize: 1000,
    settleTimeoutMs: 60_000,
    pollIntervalMs: 1_000,
  },
});
