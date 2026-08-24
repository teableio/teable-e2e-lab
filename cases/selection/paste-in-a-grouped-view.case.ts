import { defineBugCase } from "../../framework/types";

// T4853: grouping rearranges a table completely - the same rows in an order
// that has nothing to do with how they were entered, which is the point of it
// and how most people look at a table of any size. Operations addressed by
// position worked out which rows they meant without applying the grouping, so
// they counted from a different order than the screen shows: the value lands
// on a row nobody selected, the selected row is untouched, and nothing reports
// an error.
export default defineBugCase({
  id: "selection/paste-in-a-grouped-view",
  title: "A grouped view and a paste agree on which row is which",
  runner: "grouped-range-offset",
  timeoutMs: 180_000,
  bug: {
    issue: "T4853",
    status: "fixed",
    sourceCommits: ["93ea7540e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-grouped-range",
    // Interleaved on purpose: grouping has to move rows for the case to mean
    // anything.
    rows: [
      { name: "north-1", group: "North" },
      { name: "south-1", group: "South" },
      { name: "north-2", group: "North" },
      { name: "south-2", group: "South" },
    ],
    groupOrder: "asc",
    pasteAtOffset: 1,
    pastedValue: "pasted-here",
  },
});
