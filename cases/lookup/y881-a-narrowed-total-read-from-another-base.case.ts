import { defineBugCase } from "../../framework/types";

// T7075: a total narrowed by a condition, a column reading that total, and two
// columns in another base reading those. Changing the number underneath has to
// reach all four. The narrowed total was worked out one linked row at a time
// during an update, so a host carrying several of them could run past the time
// a statement is allowed and be dropped - leaving the report in the other base
// holding the number from before, with nothing on the row to say so.
export default defineBugCase({
  id: "lookup/y881-a-narrowed-total-read-from-another-base",
  title: "A change reaches a narrowed total and the report reading it",
  runner: "filtered-rollup-cross-base-refresh",
  timeoutMs: 300_000,
  bug: {
    issue: "T7075",
    status: "fixed",
    sourceCommits: ["468cbd29f"],
  },
  config: {
    baseId: "seed-base",
    namePrefix: "e2e-lab-filtered-rollup-cross-base",
    hostKey: "P1",
    countedKind: "debit",
    ignoredKind: "credit",
    countedLineName: "Debit line",
    ignoredLineName: "Credit line",
    amountBefore: 10,
    amountAfter: 15,
    ignoredAmount: 7,
    settleTimeoutMs: 90_000,
    pollIntervalMs: 3_000,
  },
});
