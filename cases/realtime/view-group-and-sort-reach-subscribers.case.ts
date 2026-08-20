import { defineBugCase } from "../../framework/types";

// T6651: changing a Grid view's group or sort persisted correctly, and an op
// was published - but it only set the document's `query`, never the top-level
// `group` / `sort` that clients read. The subscriber got a change it could not
// act on, so the grid kept its old layout until the page was reloaded. Group
// and sort are separate realtime projections, and the fix had to touch both.
export default defineBugCase({
  id: "realtime/view-group-and-sort-reach-subscribers",
  title: "Group and sort changes reach a subscribed client without a reload",
  runner: "view-property-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T6651",
    status: "fixed",
    sourceCommits: ["a878d6655"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-view-prop-rt",
    rowTitles: ["alpha", "beta", "gamma"],
    subscribeTimeoutMs: 10_000,
    settleTimeoutMs: 15_000,
  },
});
