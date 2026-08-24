import { defineBugCase } from "../../framework/types";

// T5469: deleting a row clears that row out of every link it takes part in,
// and the clearing is addressed to the table on the other end. When that table
// is gone, the clearing fails and the delete fails with it - so the table is
// one nobody can remove anything from, and the message names a table id nobody
// has ever seen, because the table it belonged to no longer exists.
export default defineBugCase({
  id: "record/delete-a-row-with-a-broken-link",
  title: "A row can be deleted when a link points at a table that is gone",
  runner: "delete-with-broken-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T5469",
    status: "fixed",
    sourceCommits: ["4eb2d5884"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-broken-link-delete",
    foreignRowTitle: "foreign-row",
    // The first is deleted; the other two have to survive it.
    rowTitles: ["row-to-delete", "row-that-stays", "another-row-that-stays"],
    // v2 parses ids strictly, so the table that is not there still has to be
    // spelled like a table id - run 32679844170 answered "Invalid TableId" on
    // both columns until it was.
    missingTableId: "tblMissingForeign00",
  },
});
