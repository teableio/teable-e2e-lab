import { defineBugCase } from "../../framework/types";

// T5496: "is this date after X" was not recognised as producing a yes or no.
// Joined into a status column with AND, it read as yes for every row that had
// a date at all, so a column meant to say "inside the window" said yes to
// everything - including the rows outside it.
export default defineBugCase({
  id: "formula/date-comparison-inside-and",
  title: "A date comparison joined with AND still excludes the rows it should",
  runner: "date-comparison-boolean",
  timeoutMs: 180_000,
  bug: {
    issue: "T5496",
    status: "fixed",
    sourceCommits: ["0a12e96a0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-and",
    combinator: "AND",
    // Inside the second half of 2024: after June 1 and before December 1.
    left: { fn: "IS_AFTER", date: "2024-06-01" },
    right: { fn: "IS_BEFORE", date: "2024-12-01" },
    // Every row is created on this date and moved to its own afterwards.
    seedDate: "2024-07-01T00:00:00.000Z",
    rows: [
      {
        name: "before-the-window",
        date: "2024-03-01T00:00:00.000Z",
        expected: false,
      },
      {
        name: "inside-the-window",
        date: "2024-08-01T00:00:00.000Z",
        expected: true,
      },
      {
        name: "after-the-window",
        date: "2025-02-01T00:00:00.000Z",
        expected: false,
      },
    ],
  },
});
