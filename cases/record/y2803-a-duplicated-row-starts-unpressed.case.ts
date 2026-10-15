import { defineBugCase } from "../../framework/types";

// T7782: Duplicating a row whose button had been pressed twice produced a copy
// already pressed twice - and, with a click cap, already used up.
export default defineBugCase({
  id: "record/y2803-a-duplicated-row-starts-unpressed",
  title: "A duplicated row's button starts unpressed",
  runner: "button-count-writes",
  timeoutMs: 180_000,
  bug: {
    issue: "T7782",
    status: "fixed",
    sourceCommits: ["cbe47ace7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-duplicate",
    scenario: "duplicate-record",
    rowTitle: "source",
    count: 2,
  },
});
