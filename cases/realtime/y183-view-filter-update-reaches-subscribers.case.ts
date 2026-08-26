import { defineBugCase } from "../../framework/types";

// T6608: updating the filter on a view that had no persisted filter emitted an
// event whose previous value was `undefined`. The realtime projection
// forwarded it, and the op it produced carried a path and nothing else once
// JSON serialized - `{ p: [...] }` with no instruction. ot-json0 refuses that,
// so every subscribed client threw `invalid / missing instruction in op`: a
// Socket Error toast on entering or filtering the table, and a filter that
// appeared not to apply. The HTTP request answered 200 throughout.
export default defineBugCase({
  id: "realtime/y183-view-filter-update-reaches-subscribers",
  title: "A subscribed client applies view filter updates without erroring",
  runner: "view-filter-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T6608",
    status: "fixed",
    // Also settles 674ff3d7b (T6563, "Socket Error when clearing view
    // filters"): this case already clears a filter, and it goes red on that
    // commit's parent too. Measured, run 32654702809 - see the case doc.
    sourceCommits: ["447a6d8dd", "674ff3d7b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-view-filter-rt",
    rowTitle: "alpha",
    subscribeTimeoutMs: 10_000,
    settleTimeoutMs: 15_000,
  },
});
