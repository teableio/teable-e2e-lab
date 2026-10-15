import { defineBugCase } from "../../framework/types";

// T7788: A PATCH setting a last-modified column's watched list back to empty
// answered 200 and changed nothing, so the column kept watching the one column
// it had been narrowed to.
export default defineBugCase({
  id: "audit-fields/y2865-patch-back-to-watching-everything",
  title: "Patching the watched list empty makes the column watch everything",
  runner: "audit-field-tracking",
  timeoutMs: 180_000,
  bug: {
    issue: "T7788",
    status: "fixed",
    sourceCommits: ["614fff9c7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-audit-patch",
    scenario: "patched-back-to-everything",
    rowTitle: "row-1",
    editDelayMs: 2000,
  },
});
