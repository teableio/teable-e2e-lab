import { defineBugCase } from "../../framework/types";

// T1111: "no duplicates" is not so much a property of a column as a promise
// about the table - order numbers are unique, this invoice was not entered
// twice. Deleting the column by mistake and pressing undo is the most ordinary
// thing that can happen to it, and undo is the product saying nothing
// happened. The column came back without its promise, and nothing on screen
// differs.
export default defineBugCase({
  id: "undo/undo-a-column-delete-brings-its-promise-back",
  title: "Undoing a column delete brings its promise back",
  runner: "undo-field-delete-constraint",
  timeoutMs: 180_000,
  bug: {
    issue: "T1111",
    status: "fixed",
    sourceCommits: ["9d5db9b8c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-undo-field-unique",
    code: "ORD-1001",
  },
});
