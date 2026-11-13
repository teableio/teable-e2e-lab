import { defineBugCase } from "../../framework/types";

// T8363: DATETIME_DIFF in days rounded instead of counting complete days, so a
// 44-hour gap read as 2 days and a 20-hour gap as 1, in either direction.
export default defineBugCase({
  id: "formula/y3763-datetime-diff-counts-complete-days",
  title: "DATETIME_DIFF in days counts only complete days",
  runner: "datetime-diff-whole-days",
  timeoutMs: 180_000,
  bug: {
    issue: "T8363",
    status: "fixed",
    sourceCommits: ["2bb6836d4"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-datetime-diff-days",
    eventTimeZone: "America/Chicago",
    formulaTimeZone: "Asia/Singapore",
    start: "2026-01-10T16:00:00.000Z",
    rows: [
      {
        name: "44 hours later",
        event: "2026-01-12T12:00:00.000Z",
        days: 1,
      },
      {
        name: "44 hours earlier",
        event: "2026-01-08T20:00:00.000Z",
        days: -1,
      },
      {
        name: "20 hours later",
        event: "2026-01-11T12:00:00.000Z",
        days: 0,
      },
      {
        name: "20 hours earlier",
        event: "2026-01-09T20:00:00.000Z",
        days: 0,
      },
    ],
  },
});
