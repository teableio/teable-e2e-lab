import { defineBugCase } from "../../framework/types";

// T7291: clearing a deleted row out of the cells that name it is done by
// looking at what the link is made of, and for a two-way link between one row
// here and many rows there, those pieces are split across the two tables: the
// key is on the rows being deleted, the column that displays them is on the
// other side. The cleanup looked for both on the table being deleted from,
// did not find one, and skipped - leaving the displayed name behind on the
// side nobody touched.
export default defineBugCase({
  id: "link/y890-a-deleted-row-stops-being-named",
  title: "A deleted row stops being named on the other side of a two-way link",
  runner: "two-way-link-delete-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "T7291",
    status: "fixed",
    sourceCommits: ["5426798399"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-two-way-link-delete",
    hostRowName: "Order 1",
    linkedRowNames: ["Widget", "Gasket"],
    settleTimeoutMs: 30_000,
    pollIntervalMs: 1_000,
  },
});
