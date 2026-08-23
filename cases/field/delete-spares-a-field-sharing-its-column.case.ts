import { defineBugCase } from "../../framework/types";

// T6619: two live fields can end up mapped to one physical column - a
// de-duplication race during concurrent field duplication produces it, and
// v2's ADD COLUMN IF NOT EXISTS hides the collision instead of failing on it.
// Deleting either field then dropped the column both of them name, so the
// surviving field lost every value it held and its metadata pointed at a
// column that is no longer there. From the grid the two look like ordinary
// columns, so nothing says which one is dangerous to delete.
export default defineBugCase({
  id: "field/delete-spares-a-field-sharing-its-column",
  title: "Deleting a field leaves the data of another field on the same column",
  runner: "delete-collateral",
  timeoutMs: 180_000,
  bug: {
    issue: "T6619",
    status: "fixed",
    sourceCommits: ["aadff16e9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-shared-column",
    variant: "sharedColumn",
    rowCount: 3,
    keptValuePrefix: "keep",
  },
});
