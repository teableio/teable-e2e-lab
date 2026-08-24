import { defineBugCase } from "../../framework/types";

// T4802: changing which column a lookup reads was saved, but what went out to
// the page with those settings open was a stripped-down copy of the column -
// missing the parts that say how the two tables are joined, and with the kind
// of value left blank. A page receiving that has to reject it, so the dialog
// goes on showing the old setting until a reload. The cost is the second step
// of an ordinary edit: the person makes the change, sees no change, and makes
// it again.
export default defineBugCase({
  id: "realtime/lookup-config-change-reaches-the-page",
  title: "A change to a lookup's settings reaches the open page whole",
  runner: "lookup-config-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T4802",
    status: "fixed",
    sourceCommits: ["6fd879ee0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-config",
    hostRowTitle: "host-row",
    foreignRowTitle: "foreign-row",
    firstValue: "owned-by-someone",
    secondValue: "in-some-region",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
    pollIntervalMs: 250,
  },
});
