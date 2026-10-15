import { defineBugCase } from "../../framework/types";

// T7786: Last-modified columns created without a list of watched columns stored
// no list at all, where the empty list means "watch everything".
export default defineBugCase({
  id: "audit-fields/y2855-a-new-audit-column-watches-everything",
  title: "A new last-modified column stores that it watches every column",
  runner: "audit-field-tracking",
  timeoutMs: 180_000,
  bug: {
    issue: "T7786",
    status: "fixed",
    sourceCommits: ["a08268455"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-audit-default",
    scenario: "created-without-a-list",
    rowTitle: "row-1",
    editDelayMs: 0,
  },
});
