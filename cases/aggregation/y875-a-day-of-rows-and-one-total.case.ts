import { defineBugCase } from "../../framework/types";

// T7060: a date column formatted as a day groups everything that happened that
// day under one heading, and the grid prints a total in each heading. The
// totals were worked out from the raw timestamp instead of the day, so two
// rows a few hours apart became groups nobody asked for and the headings the
// grid does draw got nothing. The total at the foot of the table stays
// correct, which is what makes a blank column statistic read as a display
// glitch rather than a wrong answer.
export default defineBugCase({
  id: "aggregation/y875-a-day-of-rows-and-one-total",
  title: "A day's rows add up under the day they happened",
  runner: "date-group-statistics",
  timeoutMs: 180_000,
  bug: {
    issue: "T7060",
    status: "fixed",
    sourceCommits: ["7e428c02e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-group-day",
    unit: "day",
    timeZone: "Asia/Shanghai",
    rows: [
      { title: "morning", amount: 10, at: "2026-08-06T02:00:00.000Z" },
      { title: "evening", amount: 20, at: "2026-08-06T10:00:00.000Z" },
      { title: "next-day", amount: 5, at: "2026-08-07T02:00:00.000Z" },
    ],
  },
});
