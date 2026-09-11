import { defineBugCase } from "../../framework/types";

// T7060, the other unit: a date column formatted as a month puts a whole month
// under one heading. Two rows two weeks apart are one group on screen and were
// two groups in the totals, so the month heading printed nothing. The day
// shape and the month shape are the same fault at two different truncations,
// and a case that only carried one would not say whether the unit mattered.
export default defineBugCase({
  id: "aggregation/y876-a-month-of-rows-and-one-total",
  title: "A month's rows add up under the month they happened",
  runner: "date-group-statistics",
  timeoutMs: 180_000,
  bug: {
    issue: "T7060",
    status: "fixed",
    sourceCommits: ["7e428c02e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-group-month",
    unit: "month",
    timeZone: "Asia/Shanghai",
    rows: [
      { title: "early", amount: 100, at: "2025-04-01T16:00:00.000Z" },
      { title: "mid", amount: 100, at: "2025-04-15T16:00:00.000Z" },
      { title: "next-month", amount: 50, at: "2025-05-01T16:00:00.000Z" },
    ],
  },
});
