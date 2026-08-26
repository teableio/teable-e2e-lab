import { defineBugCase } from "../../framework/types";

// T6179: "sum of the paid invoices", "hours on billable tasks only" - a
// rollup's More options filter is how a summary stops counting everything it
// can see. Converting the field mapped its link and lookup ids and dropped the
// filter, so the condition never persisted: the dialog closed, the column went
// on showing the total of everything, and the number looked plausible enough
// to use.
export default defineBugCase({
  id: "lookup/y219-rollup-condition-is-saved-and-applied",
  title:
    "A rollup's condition is saved, and the total counts only what it selects",
  runner: "rollup-filter-persists",
  timeoutMs: 300_000,
  bug: {
    issue: "T6179",
    status: "fixed",
    sourceCommits: ["de9bc1481"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rollup-filter",
    countedCategory: "Paid",
    items: [
      { name: "invoice-1", category: "Paid", amount: 100 },
      { name: "invoice-2", category: "Paid", amount: 250 },
      { name: "invoice-3", category: "Unpaid", amount: 900 },
    ],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
