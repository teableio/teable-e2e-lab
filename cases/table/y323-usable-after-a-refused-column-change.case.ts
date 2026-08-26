import { defineBugCase } from "../../framework/types";

// T4661. Two things this case measures, in order.
//
// Turning on "must be filled in" for a column that already has an empty cell
// has to be refused: accepting it leaves the table holding a row its own rule
// forbids, and nothing will ever say so. On the fix's parent it was accepted.
//
// Then, what the fix itself is about: a change the table refuses used to leave
// the table marked as not finished being set up, so reading it, adding a row
// and changing the column again were all refused afterwards - one rejected
// settings change and the table was gone until someone with database access
// lifted the mark.
export default defineBugCase({
  id: "table/y323-usable-after-a-refused-column-change",
  title: "Requiring a value is refused while a cell is still empty",
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
    // The empty cell is the point: it is what makes "must be filled in"
    // impossible to apply.
    values: ["AAA", "", "CCC"],
    rowAddedAfter: "added-after-the-failure",
    valueAddedAfter: "CCC",
    renamedTo: "Code, renamed",
  },
});
