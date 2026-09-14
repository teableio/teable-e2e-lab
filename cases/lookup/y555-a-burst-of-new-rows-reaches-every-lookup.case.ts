import { defineBugCase } from "../../framework/types";

// T7002 incident regression, fixed by T7152 (teable-ee#3337): staged INSERT
// continuations must preserve host computation inputs and committed stage
// boundaries. Appended rows could converge while existing hosts stayed stale.
// The original teable-ee#3207 inline bound did not close this path; the same
// workload reproduces on #3337's parent and converges on its fix commit.
export default defineBugCase({
  id: "lookup/y555-a-burst-of-new-rows-reaches-every-lookup",
  title: "A burst of appended linked rows reaches every lookup watching them",
  runner: "circular-append-burst",
  // Building and paced-seeding the 9.5k-row incident fixture through the
  // public API dominates this budget; the observation itself is bounded by
  // convergenceTimeoutMs.
  timeoutMs: 2_700_000,
  computedUpdateMode: "hybrid",
  bug: {
    issue: "T7002",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3337",
    sourceCommits: ["3c98735f5"],
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
