import { defineBugCase } from "../../framework/types";

// T1611: a date column that shows the time is used for things that happen
// during a day - shifts, deliveries, calls. Filtering to "after 23:36" is the
// ordinary use of such a column, and the minute is the whole point. The time
// was thrown away and only the day compared, so everything on that day landed
// on the same side of the line - and the rows that come back look right,
// because they are all from the day that was asked about.
export default defineBugCase({
  id: "filter/a-filter-on-a-time-of-day",
  title: "A filter on a time of day compares the minute",
  runner: "date-filter-minute-precision",
  timeoutMs: 180_000,
  bug: {
    issue: "T1611",
    status: "fixed",
    sourceCommits: ["e79583132"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-time-of-day-filter",
    timeZone: "Asia/Singapore",
    // 23:35, 23:37 and 23:38 local time on one day.
    rows: [
      { name: "before-the-cutoff", at: "2026-01-08T15:35:00.000Z" },
      { name: "two-minutes-after", at: "2026-01-08T15:37:00.000Z" },
      { name: "three-minutes-after", at: "2026-01-08T15:38:00.000Z" },
    ],
    after: "2026-01-08T15:36:00.000Z",
  },
});
