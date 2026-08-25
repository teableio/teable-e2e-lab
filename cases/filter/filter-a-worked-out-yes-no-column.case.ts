import { defineBugCase } from "../../framework/types";

// T1613: a worked-out yes/no column is how a table answers a question about
// itself - over budget, past due, big enough to review. Filtering to the rows
// where it says yes is the only reason to have one; nobody reads the column,
// they read the rows it selects. The filter did not select them, and a person
// cannot tell from the screen: the rows that come back look plausible and the
// missing ones are missing quietly.
export default defineBugCase({
  id: "filter/filter-a-worked-out-yes-no-column",
  title: "Filtering a worked-out yes/no column selects those rows",
  runner: "boolean-formula-filter",
  timeoutMs: 240_000,
  bug: {
    issue: "T1613",
    status: "fixed",
    sourceCommits: ["d7a76bc45"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-yes-no-filter",
    rows: [
      { name: "over-a", amount: 9 },
      { name: "over-b", amount: 12 },
      { name: "under-a", amount: 1 },
      { name: "not-filled-in", amount: null },
    ],
    threshold: 3,
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
