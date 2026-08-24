import { defineBugCase } from "../../framework/types";

// T4661: some column changes are refused by the data already in the table -
// turning on "no duplicates" over a column that has duplicates is the everyday
// example, and being refused is correct. What was not correct is what followed:
// the failed attempt left the table marked as not finished being set up, and
// everything after it was refused too - reading it, adding a row, changing the
// column back. One rejected settings change and the table was gone until
// someone with database access lifted the mark.
export default defineBugCase({
  id: "table/usable-after-a-refused-column-change",
  title: "A refused column change leaves the table usable",
  runner: "table-usable-after-failed-update",
  timeoutMs: 180_000,
  bug: {
    issue: "T4661",
    status: "fixed",
    sourceCommits: ["747c8dc93"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-failed-update",
    // The repeat is the point: it is what makes the change impossible.
    duplicateValues: ["AAA", "BBB", "AAA"],
    rowAddedAfter: "added-after-the-failure",
    valueAddedAfter: "CCC",
    renamedTo: "Code, renamed",
  },
});
