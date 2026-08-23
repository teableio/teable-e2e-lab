import { defineBugCase } from "../../framework/types";

// T6511: clearing a cell stored an empty string where v1 stored null. The two
// look identical in the grid and are different to everything that asks
// whether a cell is empty - filters, formulas, required checks. A base that
// moved from v1 to v2 therefore has two kinds of blank in one column.
export default defineBugCase({
  id: "record/cleared-cell-stores-the-same-empty",
  title: "Clearing a cell stores the same empty v1 stored",
  runner: "value-normalization",
  timeoutMs: 180_000,
  bug: {
    issue: "T6511",
    status: "fixed",
    sourceCommits: ["c0ffdb358"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-empty-write",
    variant: "emptyValue",
    seedValue: "something",
    writtenValue: "",
    expectedStored: null,
    ratingMax: 5,
  },
});
