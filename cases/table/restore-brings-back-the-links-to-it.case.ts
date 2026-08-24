import { defineBugCase } from "../../framework/types";

// T4324: deleting a table into the trash is reversible by design - that is
// what a trash is for, and the reason people are willing to delete anything.
// The other side of a link is where the reversal has to reach: a column on
// another table that pointed at the deleted one, and the looked-up values
// beside it. Restoring brought the table back and left those behind, so the
// table is back, its data is back, and the connections between it and the rest
// of the base are not - which is worse than an obvious failure, because
// everything looks restored.
export default defineBugCase({
  id: "table/restore-brings-back-the-links-to-it",
  title: "Restoring a table restores the columns pointing at it",
  runner: "restore-inbound-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T4324",
    status: "fixed",
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
