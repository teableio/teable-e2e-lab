import { defineBugCase } from "../../framework/types";

// T1506: these are the columns a table uses to keep track of itself - how long
// this has been open, who entered it, what its reference number is. The
// product fills the underlying values in as the row is created, so a column
// reading them has everything it needs at that moment. They came back empty:
// the values appear later, or on the next reload, which is exactly when nobody
// is looking any more.
export default defineBugCase({
  id: "formula/y564-columns-worked-out-from-a-new-row",
  title: "Columns worked out from a new row answer with it",
  runner: "formula-over-system-columns",
  timeoutMs: 180_000,
  bug: {
    issue: "T1506",
    status: "fixed",
    sourceCommits: ["78b9feef0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-system-formula",
    rowTitle: "the-new-row",
  },
});
