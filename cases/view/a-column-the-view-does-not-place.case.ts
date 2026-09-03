import { defineBugCase } from "../../framework/types";

// T6545: the notes a view keeps about a column say where it sits and how wide it
// is. Views made long enough ago have entries with a width and no position at all
// - a shape nothing writes any more. Read back, the missing position was passed
// through as missing, so whatever draws the view was handed a column with no
// place among the others.
export default defineBugCase({
  id: "view/a-column-the-view-does-not-place",
  title: "A column whose stored notes give it no place still gets one",
  runner: "legacy-column-visibility-metadata",
  timeoutMs: 180_000,
  bug: {
    issue: "T6545",
    status: "fixed",
    sourceCommits: ["fd32044e4"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-column-place",
    rowTitle: "a-row-in-the-table",
    legacy: "noPosition",
    order: 1,
    width: 241,
  },
});
