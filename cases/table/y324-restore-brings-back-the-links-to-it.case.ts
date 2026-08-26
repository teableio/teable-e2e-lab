import { defineBugCase } from "../../framework/types";

// Declared open: this reproduces on develop, not only on the fix's parent.
//
// Deleting a table into the trash is reversible by design - that is what a
// trash is for, and the reason people are willing to delete anything. The
// other side of a link is where the reversal has to reach: a column on another
// table that pointed at the deleted one, and the looked-up values beside it.
//
// Trashing the table turns that column into plain text, which is deliberate
// (see table/y163-trash-degrades-inbound-link). Restoring does not turn it back.
// The table is back, its rows are back, and the connections between it and the
// rest of the base are not - which is worse than an obvious failure, because
// everything looks restored.
//
// T4324 fixed this for links that cross bases. The same-base case measured
// here still reproduces on develop: runs 32693759397 and 32694125208, the
// second polling for 30 seconds in case the restore finishes late.
export default defineBugCase({
  id: "table/y324-restore-brings-back-the-links-to-it",
  title: "Restoring a table restores the columns pointing at it",
  runner: "restore-inbound-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T4324",
    status: "open",
    sourceCommits: ["68ba10a13"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-restore-inbound",
    hostRowTitle: "host-row",
    foreignRowTitle: "Account 1042",
    foreignDetail: "the detail looked up",
    settleTimeoutMs: 30_000,
    pollIntervalMs: 1_000,
  },
});
