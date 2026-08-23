import { defineBugCase } from "../../framework/types";

// T6406: "total of the electronics only", "hours booked against this client",
// "invoices still unpaid" - a summary with a condition is how a column narrows
// what it counts. Changing a value it counts has to move it, and the
// propagation deciding which summaries a write dirties skipped the filtered
// path. The write answered 200, the source row showed its new value, and the
// summary beside it kept the old number until something unrelated forced a
// recompute.
export default defineBugCase({
  id: "lookup/conditional-summary-follows-a-counted-row",
  title: "A conditional summary follows a change to a row it counts",
  runner: "conditional-rollup-propagation",
  timeoutMs: 300_000,
  bug: {
    issue: "T6406",
    status: "fixed",
    sourceCommits: ["ccc43864e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-conditional-total",
    matchedCategory: "Electronics",
    rows: [
      { name: "laptop", category: "Electronics", price: 1000 },
      { name: "monitor", category: "Electronics", price: 500 },
      { name: "novel", category: "Books", price: 20 },
    ],
    editedPrice: 1500,
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
