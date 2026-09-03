import { defineBugCase } from "../../framework/types";

// T6928: deleting a row also records what was in it, so the delete can be
// undone. That recording is the product's convenience, not the person's
// decision. When it could not be made, the delete was undone too - the row
// came back, nothing on screen mentioned undo, and there was no way to get rid
// of the row. Losing the ability to undo is a smaller loss than losing the
// ability to delete.
export default defineBugCase({
  id: "record/y567-delete-a-row-whose-undo-bookkeeping-is-missing",
  title: "A row is deleted when its undo bookkeeping is not in place",
  runner: "delete-without-undo-capture",
  timeoutMs: 180_000,
  bug: {
    issue: "T6928",
    status: "fixed",
    sourceCommits: ["4e340448e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-delete-no-undo",
    deletedRowName: "the-deleted-row",
    keptRowName: "the-kept-row",
  },
});
