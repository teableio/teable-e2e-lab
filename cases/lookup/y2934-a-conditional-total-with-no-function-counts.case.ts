import { defineBugCase } from "../../framework/types";

// T7753: Creating a conditional rollup through the API without naming an
// aggregation was refused outright, though the editor treats an unnamed one as
// "count them".
export default defineBugCase({
  id: "lookup/y2934-a-conditional-total-with-no-function-counts",
  title: "A conditional rollup created without a function counts its matches",
  runner: "conditional-rollup-create-options",
  timeoutMs: 180_000,
  bug: {
    issue: "T7753",
    status: "fixed",
    sourceCommits: ["12227acb9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-conditional-default",
    hostTitle: "host-1",
    fieldName: "Default count",
    amounts: [10, 20, 30],
    threshold: 15,
    request: {},
    expect: {
      expression: "countall({values})",
      aggregation: "count",
      absentOptions: [],
    },
  },
});
