import { defineBugCase } from "../../framework/types";

// T7536: sorting by a number borrowed through a link compared the numbers as
// text, so 2, 5, 12, 13 and 22 came back as 12, 13, 2, 22, 5.
export default defineBugCase({
  id: "lookup/sort-by-a-borrowed-number",
  title: "Sorting by a borrowed number is numeric",
  runner: "lookup-number-sort",
  timeoutMs: 120_000,
  bug: {
    issue: "T7536",
    status: "fixed",
    sourceCommits: ["5970fbe7f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-number-sort",
    amounts: [2, 12, 22, 13, 5],
  },
});
