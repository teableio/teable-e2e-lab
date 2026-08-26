import { defineBugCase } from "../../framework/types";

// T6349: sorting a grid rewrites the view's own row order, which the product
// does with raw SQL for speed. Nothing then told the subscribers, so the rows
// in front of whoever clicked sort did not move - the click looked dead. And
// the socket's cached answer for that view kept its pre-sort order, so a
// refresh served the stale order back over the correct one the page had
// rendered.
export default defineBugCase({
  id: "realtime/y214-manual-sort-reaches-the-open-page",
  title: "Sorting a view moves the rows on the page that sorted it",
  runner: "manual-sort-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T6349",
    status: "fixed",
    sourceCommits: ["be42ececd"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-manual-sort",
    // Created in this order, so ascending is a real rearrangement.
    rowRanks: [3, 1, 2],
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
  },
});
