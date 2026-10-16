import { defineBugCase } from "../../framework/types";

// T7818: Converting date-only text to a date read it in the wrong zone, so the
// date landed on the wrong instant.
export default defineBugCase({
  id: "field/y2752-text-converted-to-a-date-lands-on-local-midnight",
  title:
    "Date-only text converted to a date lands on midnight in the column's zone",
  runner: "field-conversion-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7818",
    status: "fixed",
    sourceCommits: ["40186d049"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-text-to-date",
    source: {
      type: "singleLineText",
    },
    target: {
      type: "date",
      options: {
        formatting: {
          date: "YYYY-MM-DD",
          time: "None",
          timeZone: "Asia/Shanghai",
        },
      },
    },
    rows: [
      {
        name: "date-only",
        before: "2024-03-15",
        after: "2024-03-14T16:00:00.000Z",
      },
      {
        name: "not-a-date",
        before: "abc",
        after: null,
      },
    ],
  },
});
