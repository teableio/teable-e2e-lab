import { defineBugCase } from "../../framework/types";

// T7787: Deleting the only column a last-modified pair watched left the deleted
// column's id in their lists, so they watched nothing that still exists and
// stopped moving for good.
export default defineBugCase({
  id: "audit-fields/y2857-deleting-the-watched-column",
  title: "Deleting the only watched column falls back to watching everything",
  runner: "audit-field-tracking",
  timeoutMs: 180_000,
  bug: {
    issue: "T7787",
    status: "fixed",
    sourceCommits: ["a08268455"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-audit-deleted",
    scenario: "watched-column-deleted",
    rowTitle: "row-1",
    editDelayMs: 2000,
  },
});
