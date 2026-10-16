import { defineBugCase } from "../../framework/types";

// T7815: Writing `15/03/2024` without typecast into a date column formatted
// D/M/YYYY was refused as invalid, though it is a valid date in the column's
// own format.
export default defineBugCase({
  id: "record/y2748-a-day-first-date-without-typecast",
  title: "A date in the column's own format is accepted without typecast",
  runner: "typecast-write-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7815",
    status: "fixed",
    sourceCommits: ["40186d049"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-day-first-exact",
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
    typecast: false,
    input: "15/03/2024",
    expectedValue: "2024-03-14T16:00:00.000Z",
  },
});
