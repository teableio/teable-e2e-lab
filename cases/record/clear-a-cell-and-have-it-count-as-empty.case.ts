import { defineBugCase } from "../../framework/types";

// T6520: there are two ways to say a cell has nothing in it. The interface
// says it one way - blank text, an unticked box, an empty list of tags - and a
// cell that was never filled in says it the other. Stored as they arrive
// rather than made the same, a cleared cell looks empty on screen and is not
// empty to anything that asks: filters for empty cells skip the row.
export default defineBugCase({
  id: "record/clear-a-cell-and-have-it-count-as-empty",
  title: "Clearing a cell leaves it empty to a filter too",
  runner: "empty-write-normalization",
  timeoutMs: 180_000,
  bug: {
    issue: "T6520",
    status: "fixed",
    sourceCommits: ["b487d603d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-empty-write",
    filledRowName: "the-cleared-row",
    untouchedRowName: "the-untouched-row",
    notes: "something worth clearing",
    tags: ["tag-a", "tag-b"],
  },
});
