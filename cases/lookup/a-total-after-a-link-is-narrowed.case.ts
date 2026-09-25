import { defineBugCase } from "../../framework/types";

// T7575: a link widened to many-to-many and narrowed back to one customer per
// order dropped an order from a customer, and that customer's total kept
// counting it. The link columns on both sides were right; only the total was
// never worked out again.
export default defineBugCase({
  id: "lookup/a-total-after-a-link-is-narrowed",
  title: "A customer's total drops an order the narrowed link took away",
  runner: "link-narrowed-rollup-refresh",
  timeoutMs: 180_000,
  bug: {
    issue: "T7575",
    status: "fixed",
    sourceCommits: ["35f14d1cb"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-narrowed-link-total",
    movedAmount: 30,
    stayingAmount: 70,
  },
});
