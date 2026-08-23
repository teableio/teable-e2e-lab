import { defineBugCase } from "../../framework/types";

// T5496, the other combinator. OR is the shape a status column has when either
// of two dates qualifies a row; with the comparison not recognised as a yes or
// no, it too answered yes to every row that had a date.
export default defineBugCase({
  id: "formula/date-comparison-inside-or",
  title: "A date comparison joined with OR still excludes the rows it should",
  runner: "date-comparison-boolean",
  timeoutMs: 180_000,
  bug: {
    issue: "T5496",
    status: "fixed",
    sourceCommits: ["0a12e96a0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-or",
    combinator: "OR",
    // On June 1 or after it.
    left: { fn: "IS_AFTER", date: "2024-06-01" },
    right: { fn: "IS_SAME", date: "2024-06-01" },
    // Every row is created on this date and moved to its own afterwards.
    seedDate: "2024-07-01T00:00:00.000Z",
    rows: [
      {
        name: "before-the-date",
        date: "2024-03-01T00:00:00.000Z",
        expected: false,
      },
      {
        name: "after-the-date",
        date: "2024-08-01T00:00:00.000Z",
        expected: true,
      },
    ],
  },
});
