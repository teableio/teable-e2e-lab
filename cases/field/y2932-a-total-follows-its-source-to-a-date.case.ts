import { defineBugCase } from "../../framework/types";

// T7752: converting a number column to a date left a rollup over it declaring
// itself a number with a ring display; on the reported revision the
// conversion failed outright with a database error.
export default defineBugCase({
  id: "field/y2932-a-total-follows-its-source-to-a-date",
  title: "A rollup follows its source column from number to date",
  runner: "computed-type-change-reset",
  timeoutMs: 180_000,
  bug: {
    issue: "T7752",
    status: "fixed",
    sourceCommits: ["402cb1ce8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-number-to-date",
    values: [10, 20, 30],
    orderTitle: "order-1",
  },
});
