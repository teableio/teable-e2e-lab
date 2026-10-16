import { defineBugCase } from "../../framework/types";

// T7817: Converting a date column to text wrote the date without the column's
// format and time zone, so the text did not match what the column had shown.
export default defineBugCase({
  id: "field/y2751-a-date-converted-to-text-uses-its-own-zone",
  title: "A date converted to text reads as the column showed it",
  runner: "field-conversion-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7817",
    status: "fixed",
    sourceCommits: ["40186d049"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-to-text",
    source: {
      type: "date",
      options: {
        formatting: {
          date: "YYYY-MM-DD",
          time: "HH:mm",
          timeZone: "Asia/Tokyo",
        },
      },
    },
    target: {
      type: "singleLineText",
    },
    rows: [
      {
        name: "morning",
        before: "2024-03-15T01:30:00.000Z",
        after: "2024-03-15 10:30",
      },
    ],
  },
});
