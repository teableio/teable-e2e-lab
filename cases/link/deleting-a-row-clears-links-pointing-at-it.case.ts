import { defineBugCase } from "../../framework/types";

// T5381: deleting a row has to clear it out of every cell that pointed at it.
// The clearing recognised link columns by a piece of their stored shape, and
// columns written by an older version carry that shape differently, so those
// were skipped. What is left is a cell naming a row that is not there - it
// still shows a name, filters still count it, opening it finds nothing. The
// table that was cleaned up looks clean and the damage is on another table
// entirely, which is why nobody connects the two.
export default defineBugCase({
  id: "link/deleting-a-row-clears-links-pointing-at-it",
  title: "Deleting a row empties the cells that pointed at it",
  runner: "incoming-link-cleanup",
  timeoutMs: 180_000,
  skipV1:
    "the legacy link shape is not one v1 writes - measured: plain deletes clear their inbound cells on v1",
  bug: {
    issue: "T5381",
    status: "fixed",
    sourceCommits: ["0e6756429"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-incoming-link",
    deletedRowTitle: "Project that is deleted",
    keptRowTitle: "Project that stays",
    pointingRowTitle: "task-pointing-at-the-deleted-one",
    otherRowTitle: "task-pointing-at-the-other-one",
  },
});
