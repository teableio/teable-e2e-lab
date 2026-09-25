import { defineBugCase } from "../../framework/types";

// T7548: a batch update that linked rows by id only reached everyone watching
// the table without the linked rows' titles, so the link column read
// "Untitled" until a refresh. The columns borrowed through the link were
// right. Only under the production (hybrid) computed-update strategy.
export default defineBugCase({
  id: "realtime/a-batch-of-links-arrives-with-titles",
  title: "A batch of links reaches a watcher with the titles on them",
  runner: "link-title-realtime",
  timeoutMs: 180_000,
  computedUpdateMode: "hybrid",
  bug: {
    issue: "T7548",
    status: "fixed",
    sourceCommits: ["f6d0857a0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-batch-link-titles",
    // The report's table held 153 rows, written in one batch.
    rowCount: 153,
    relationship: "manyOne",
    subscribeTimeoutMs: 10_000,
    settleTimeoutMs: 15_000,
  },
});
