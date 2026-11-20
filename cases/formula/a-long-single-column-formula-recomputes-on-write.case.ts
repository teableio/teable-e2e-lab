import { defineBugCase } from "../../framework/types";

// T8631: A formula made of many small terms over one column could be created
// and filled in, but creating or changing a row afterwards was refused because
// a limit meant for several formulas at once was applied to it.
export default defineBugCase({
  id: "formula/a-long-single-column-formula-recomputes-on-write",
  title: "A long formula over one column recomputes when rows are written",
  runner: "long-formula-recompute",
  timeoutMs: 240_000,
  bug: {
    issue: "T8631",
    status: "fixed",
    sourceCommits: ["f8859f50a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-long-formula",
    groups: [50, 50, 10],
    initialValue: "initial/value",
    createdValue: "new/value",
    updatedValue: "updated/value",
    settleTimeoutMs: 60_000,
    settlePollIntervalMs: 1_000,
  },
});
