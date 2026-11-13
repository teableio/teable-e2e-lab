import { defineBugCase } from "../../framework/types";

// T8058: Hiding a column and showing it again left a "shown" entry behind, and
// the view was treated as curated: new columns stayed hidden in it.
export default defineBugCase({
  id: "view/y3371-a-view-that-hides-nothing-shows-new-columns",
  title: "A view that hides no column shows columns added later",
  runner: "new-field-visible-in-unhidden-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T8058",
    status: "fixed",
    sourceCommits: ["c609d41b1"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-new-column-visible",
  },
});
