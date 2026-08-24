import { defineBugCase } from "../../framework/types";

// T5087: a sort only decides the order of rows whose values differ; rows that
// tie keep whatever order the view already had, which is what dragging a row
// does. Operations addressed by position - paste, clear, delete a range -
// resolved that tie differently from the grid, so they landed on a different
// row than the one selected. Nothing about it looks like an error: a value
// appears in the column, on the wrong row, and the row that was supposed to
// change is untouched.
export default defineBugCase({
  id: "selection/paste-lands-on-the-row-you-see",
  title: "A sorted view keeps the order rows were dragged into",
  runner: "tied-sort-offset",
  timeoutMs: 180_000,
  bug: {
    issue: "T5087",
    status: "fixed",
    sourceCommits: ["65a966ad9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-tied-sort",
    sharedStatus: "In progress",
    rowTitles: ["row-a", "row-b", "row-c", "row-d"],
    // Dragged to the top, so the visible order is not the creation order.
    draggedRowTitle: "row-d",
    pastedValue: "pasted-here",
  },
});
