import { defineBugCase } from "../../framework/types";

// T6751: "排序+分组情况下，排序混乱" - one user group, sorted by date
// descending, and the years came out 2026, 2025, 2026. The group header folded
// every stored snapshot of the collaborator into one bucket, but the SQL still
// ordered by the raw stored JSON, so the sort silently restarted at each
// snapshot variant.
export default defineBugCase({
  id: "lookup/user-snapshot-date-sort-spans-group",
  title: "同一个协作者的多份快照折成一组后，组内日期倒序要一路贯通",
  runner: "lookup-user-snapshot-sort",
  timeoutMs: 180_000,
  bug: {
    issue: "T6751",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-user-snapshot-sort",
    timeZone: "Asia/Shanghai",
    snapshotGroups: [
      {
        // The snapshot as it was before the collaborator had an avatar.
        key: "older-orders",
        snapshotExtras: { email: "a@example.com" },
        rows: [
          { name: "d-2025-07", date: "2025-07-31T00:00:00.000Z" },
          { name: "d-2025-04", date: "2025-04-29T00:00:00.000Z" },
          { name: "d-2024-11", date: "2024-11-14T00:00:00.000Z" },
        ],
      },
      {
        // The same person, later: different email, now with an avatar. Sorts
        // after the older snapshot as raw JSON, which is what dragged the 2026
        // rows to the bottom of the group.
        key: "newer-orders",
        snapshotExtras: {
          email: "z@example.com",
          avatarUrl: "https://example.com/avatar.png",
        },
        rows: [
          { name: "d-2026-02", date: "2026-02-04T00:00:00.000Z" },
          { name: "d-2026-01", date: "2026-01-29T00:00:00.000Z" },
        ],
      },
    ],
  },
});
