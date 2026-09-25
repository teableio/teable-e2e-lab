import { defineBugCase } from "../../framework/types";

// T7404: a date column formatted to show the day only sorted by the day it
// shows, so rows on the same day came back in the order they were added
// instead of by their time. Switching the hour back on changed the order.
export default defineBugCase({
  id: "view/sort-a-date-that-hides-the-hour",
  title: "Sorting by a date that hides the hour still follows the hour",
  runner: "date-sort-hidden-time",
  timeoutMs: 120_000,
  bug: {
    issue: "T7404",
    status: "fixed",
    sourceCommits: ["16dfba274"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-day-only-sort",
    timeZone: "Asia/Shanghai",
    // 18:00, 08:30 and 12:00 on 10 March in Shanghai, then 22:00 on the 9th.
    rows: [
      { name: "evening", at: "2026-03-10T10:00:00.000Z" },
      { name: "morning", at: "2026-03-10T00:30:00.000Z" },
      { name: "noon", at: "2026-03-10T04:00:00.000Z" },
      { name: "day-before", at: "2026-03-09T14:00:00.000Z" },
    ],
  },
});
