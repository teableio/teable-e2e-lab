import { defineBugCase } from "../../framework/types";

// T6074: "everything except these" is how a table is cleared out in practice -
// select all, click off the few worth keeping, delete. The rows are deleted in
// batches that walk the table by position, and the rows being kept were passed
// over without the position moving past them, so each batch started where the
// previous one did and the walk stopped early. Some rows were deleted, some
// were silently left, and which ones depends on where the kept rows fell.
export default defineBugCase({
  id: "selection/y895-delete-everything-except-these",
  title: "Deleting everything except a few rows leaves exactly those rows",
  runner: "delete-all-except",
  timeoutMs: 900_000,
  bug: {
    issue: "T6074",
    status: "fixed",
    sourceCommits: ["87079ae8e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-delete-all-except",
    // The delete walks the table in batches of 5000, and a stalled offset only
    // shows when the walk has to cross into the next batch. Eight rows is one
    // batch and is green on both sides - run 34575930130.
    rowCount: 5200,
    writeBatchSize: 500,
    // Early, not trailing: a kept row near the start is what stalls the walk
    // for everything after it.
    keepPositions: [3, 1500],
  },
});
