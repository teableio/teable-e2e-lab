import { defineBugCase } from "../../framework/types";

// T6571: a table stopped loading records entirely - "Socket Error
// internal_server_error: Failed to load table records: error: COALESCE types
// text and jsonb cannot be matched". The saved view filtered a scalar lookup
// with isNoneOf, and that path compiled the lookup as if it held a JSON array.
export default defineBugCase({
  id: "filter/scalar-lookup-none-of-loads",
  title: "视图对标量 lookup 用 isNoneOf 筛选时，记录列表仍然加载得出来",
  runner: "lookup-filter-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T6571",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-none-of",
    allowedCategory: "Allowed",
    excludedCategories: ["Excluded A", "Excluded B"],
    rows: [
      { task: "allowed-task", category: "Allowed" },
      { task: "excluded-task-a", category: "Excluded A" },
      { task: "excluded-task-b", category: "Excluded B" },
      // Links to nothing: the isNotEmpty half of the filter has to remove it,
      // and it is the row that tells an over-eager filter from a broken one.
      { task: "unlinked-task", category: null },
    ],
    expectedTasks: ["allowed-task"],
  },
});
