import { defineBugCase } from "../../framework/types";

// T7754: A conditional sum created with a sort and a limit kept both and
// applied them, so "the total of everything over the line" silently became "the
// largest one".
export default defineBugCase({
  id: "lookup/y2935-a-conditional-sum-drops-sort-and-limit",
  title: "A conditional sum ignores a sort and limit and totals every match",
  runner: "conditional-rollup-create-options",
  timeoutMs: 180_000,
  bug: {
    issue: "T7754",
    status: "fixed",
    sourceCommits: ["c3bc8daf6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-conditional-sum",
    hostTitle: "host-1",
    fieldName: "Matching total",
    amounts: [10, 20, 30],
    threshold: 0,
    request: {
      expression: "sum({values})",
      sortOrder: "desc",
      limit: 1,
    },
    expect: {
      expression: "sum({values})",
      aggregation: "sum",
      absentOptions: ["sort", "limit"],
    },
  },
});
