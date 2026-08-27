import { defineBugCase } from "../../framework/types";

// T7002: under the production-default hybrid computed-update strategy,
// sequential bulk INSERT batches into a circular cross-table lookup graph
// race each other on the per-table computed advisory lock: the previous
// batch's dispatched outbox task loses (computed:run:failed
// lock_unavailable) and its propagation is silently dropped — every write
// answered 201, computed_update_outbox is empty, and the host rows' lookups
// and formulas never converge. This is the silent-data-loss face of the
// 2026-08-27 CN production incident, on the very fixture shape that
// triggered it, and a path the teable-ee#3207 inline bounding (98f225c53)
// does not close: the case reproduces identically before and after that fix.
export default defineBugCase({
  id: "lookup/a-burst-of-new-rows-reaches-every-lookup",
  title: "A burst of appended linked rows reaches every lookup watching them",
  runner: "circular-append-burst",
  // Building and paced-seeding the 9.5k-row incident fixture through the
  // public API dominates this budget; the observation itself is bounded by
  // convergenceTimeoutMs.
  timeoutMs: 2_700_000,
  computedUpdateMode: "hybrid",
  bug: {
    issue: "T7002",
    status: "open",
    link: "https://github.com/teableio/teable-ee/pull/3207",
    // The #3207 fix commit: this case settles it by reproducing on it — the
    // inline bounding it added does not cover the dispatched-task loss path.
    sourceCommits: ["98f225c53"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-circular-append",
    // The incident fingerprint scale (rounded the same way the perf-lab
    // reproduction rounded it): 6,287/3,031/477/3 -> 6,000/3,000/500/3.
    orderRowCount: 6_000,
    subOrderRowCount: 3_000,
    purificationRowCount: 500,
    plasmidRowCount: 3,
    // Multipliers coprime with their target counts; 500 seeded + 400
    // appended = 900 distinct hosts out of 3,000 sub-orders.
    orderPermutation: { multiplier: 7, offset: 3 },
    purificationSubOrderPermutation: { multiplier: 13, offset: 5 },
    purificationOrderPermutation: { multiplier: 11, offset: 2 },
    seedBatchSize: 500,
    purificationSeedBatchSize: 100,
    seedSettleTimeoutMs: 120_000,
    // The burst: 400 new rows (p = 501..900) in FOUR back-to-back batches of
    // 100, every row wiring both duplicate backrefs + plasmid + order links —
    // the write shape from the incident base.
    appendRowCount: 400,
    appendBatchSize: 100,
    // A healthy sync-mode run of this exact operation converges in ~13s at
    // this scale; five minutes is the "never" bound, not a race.
    convergenceTimeoutMs: 300_000,
    pollIntervalMs: 500,
    staleRowEvidenceLimit: 10,
  },
});
