import { defineBugCase } from "../../framework/types";

// T1516: a many-to-many link is kept in two places - a cell on each row, and a
// separate record of the pairing. Bases that have been through imports,
// restores and older versions have rows where the two disagree. Deleting such
// a row was refused with a message about a constraint, and nothing on screen
// explains it: the row looks ordinary, the delete is ordinary, and it will not
// go.
export default defineBugCase({
  id: "record/delete-a-row-whose-link-records-disagree",
  title: "A row whose link records disagree can be deleted",
  runner: "delete-with-inconsistent-junction",
  timeoutMs: 180_000,
  bug: {
    issue: "T1516",
    status: "fixed",
    sourceCommits: ["301a8ea59"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-junction-disagreement",
    hostRowName: "the-host-row",
    deletedRowName: "the-deleted-row",
    keptRowName: "the-kept-row",
  },
});
