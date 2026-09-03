import { defineBugCase } from "../../framework/types";

// T7071: a filter box produces text, and every numeric column took the number
// that way - except the row-number column, whose comparison demanded a real
// number and answered 500 to a string. The page saved the filter and then broke
// on the row count, so the view a person had just built would not open, and
// would not open again on the next visit either.
export default defineBugCase({
  id: "filter/a-row-number-filter-typed-into-the-box",
  title: "A row-number filter holding what the filter box typed",
  runner: "autonumber-string-filter",
  timeoutMs: 180_000,
  bug: {
    issue: "T7071",
    status: "fixed",
    sourceCommits: ["d9f5e61c6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-autonumber-filter",
    rowTitles: ["row-a", "row-b", "row-c", "row-d", "row-e"],
    threshold: 2,
  },
});
