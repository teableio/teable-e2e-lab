import { defineBugCase } from "../../framework/types";

// T6332: borrowing a column is the same action whatever kind of column is
// borrowed, and what comes back should be a column like any other. Borrowing a
// worked-out column copied that column's instruction along with it, so the
// borrowed column carried an instruction that made no sense where it now was:
// saving its own settings was refused, and it could not be renamed,
// reformatted or converted. The only way past it was deleting it.
export default defineBugCase({
  id: "lookup/y899-a-borrowed-worked-out-column-can-be-saved",
  title: "A borrowed worked-out column can still be saved",
  runner: "lookup-of-formula-editable",
  timeoutMs: 180_000,
  bug: {
    issue: "T6332",
    status: "fixed",
    sourceCommits: ["98790484e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-of-formula",
    hostRowName: "the-row",
    amount: 21,
    bonus: 5,
    newName: "Borrowed total, renamed",
    newPrecision: 2,
  },
});
