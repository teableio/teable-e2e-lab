import { defineBugCase } from "../../framework/types";

// T6250: renaming a rollup column recomputed the whole column, and on a table
// whose storage predates the current layout that recompute cannot be written.
// The rename is refused, with a message about types that has nothing to do
// with what was asked. Which tables have that older storage is not visible
// from the product, so two bases look identical and only one refuses.
export default defineBugCase({
  id: "lookup/y237-rename-a-rollup-keeps-its-total",
  title: "Renaming a rollup does not touch what it holds",
  runner: "rollup-metadata-rename",
  timeoutMs: 180_000,
  bug: {
    issue: "T6250",
    status: "fixed",
    sourceCommits: ["e442fc84f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rollup-rename",
    hostRowTitle: "host-row",
    // Sums to 60, so a total that changed is visible rather than coincidental.
    amounts: [10, 20, 30],
    renamedTo: "Total, renamed",
    newDescription: "Metadata only",
  },
});
