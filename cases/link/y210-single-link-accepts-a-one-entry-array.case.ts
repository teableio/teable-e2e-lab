import { defineBugCase } from "../../framework/types";

// T6510: v1 was tolerant about the shape of a link cell - an array with one
// entry for a single-value link, a bare object for a multi-value one - and
// integrations written against it send those shapes. v2's strict path rejected
// them, so a script that had been writing rows for a year started answering
// 400 on exactly the field that connects two tables.
export default defineBugCase({
  id: "link/y210-single-link-accepts-a-one-entry-array",
  title: "A single-value link accepts the one-entry array v1 accepted",
  runner: "link-cell-shape",
  timeoutMs: 180_000,
  bug: {
    issue: "T6510",
    status: "fixed",
    sourceCommits: ["3c0513b1a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-array-single",
    shape: "arrayIntoSingle",
  },
});
