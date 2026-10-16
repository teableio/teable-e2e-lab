import { defineBugCase } from "../../framework/types";

// T7814: Writing `04/03/2024` with typecast into a date column formatted
// D/M/YYYY read it month-first, so the fourth of March landed on the third of
// April.
export default defineBugCase({
  id: "record/y2747-a-day-first-date-is-read-day-first",
  title: "A typecast date in the column's day-first format is read day-first",
  runner: "typecast-write-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7814",
    status: "fixed",
    sourceCommits: ["40186d049"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-typecast-day-first",
    field: {
      type: "date",
      options: {
        formatting: {
          date: "D/M/YYYY",
          time: "None",
          timeZone: "Asia/Shanghai",
        },
      },
    },
    input: "04/03/2024",
    expectedValue: "2024-03-03T16:00:00.000Z",
  },
});
