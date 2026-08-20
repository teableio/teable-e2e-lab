import { defineBugCase } from "../../framework/types";

// A sentinel, not a reproduction: there is no bug behind this and no commit
// where it goes red. It guards the delete/undo path, which was rewritten three
// times in two weeks - trash persistence folded into the delete transaction,
// per-row trash markers replaced by a single index row, undo snapshots skipped
// for value-preserving conversions. Every one of those removes something undo
// might rely on, and the failure would be silent: undo still answers
// "fulfilled", it just brings back less than it took.
export default defineBugCase({
  id: "undo/delete-records-undo-restores-all",
  title: "Undoing a delete restores every row, its order and every cell",
  runner: "delete-undo-restores",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/delete-undo-restores-all",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-delete-undo",
    // Enough rows that a partial restore is visible; one row could only ever
    // be all-or-nothing.
    recordCount: 12,
  },
});
