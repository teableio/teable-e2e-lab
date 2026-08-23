import { defineBugCase } from "../../framework/types";

// T5583: the filter panel saves an exact date together with the zone that
// decides which day that date is. Matching ignored the zone, so east of UTC a
// filter for one day answered with the neighbouring day's rows - a plausible
// list, which is what makes it worse than an error.
export default defineBugCase({
  id: "filter/date-filter-uses-the-zone-it-was-given",
  title: "An exact date filter matches the day in the zone it was given",
  runner: "legacy-date-filter",
  timeoutMs: 180_000,
  bug: {
    issue: "T5583",
    status: "fixed",
    sourceCommits: ["e0d3eaf6c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-filter-zone",
    filterValue: "exactDateWithZone",
    operator: "isOnOrAfter",
    // UTC+8: the two instants below are the 13th here and the 12th in UTC.
    timeZone: "Asia/Shanghai",
    rows: [
      // 00:30 on the 13th in Shanghai, still the 12th in UTC.
      { name: "just-after-local-midnight", date: "2026-02-12T16:30:00.000Z" },
      // 23:00 on the 12th in Shanghai, and the 12th in UTC too.
      { name: "just-before-local-midnight", date: "2026-02-12T15:00:00.000Z" },
      // Comfortably the 11th in both.
      { name: "the-day-before", date: "2026-02-11T02:00:00.000Z" },
    ],
    filterDate: "2026-02-12T16:30:00.000Z",
  },
});
