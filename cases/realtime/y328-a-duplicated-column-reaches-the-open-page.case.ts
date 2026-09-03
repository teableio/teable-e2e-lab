import { defineBugCase } from "../../framework/types";

// T3604: duplicating a column is how a column gets reshaped safely - make a
// copy, change the copy, delete the original. Nothing announced the copy, so
// everyone else with the table open, and the person's own second tab, carried
// on working in a table that was missing it. The cost is not the reload: it is
// that two people describing the same table describe different tables.
export default defineBugCase({
  id: "realtime/y328-a-duplicated-column-reaches-the-open-page",
  title: "A duplicated column arrives on the open page",
  runner: "duplicate-field-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T3604",
    status: "fixed",
    sourceCommits: ["7a1635166"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-field",
    rowTitle: "the-row",
    copyName: "Amount copy",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
  },
});
