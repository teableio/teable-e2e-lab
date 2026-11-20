import { defineBugCase } from "../../framework/types";

// Sentinel for T8613. Streamed deletes now work in small batches, and a ring of
// rows held together by a required link to the same table can only be deleted
// together: a batch that splits it leaves a row pointing at a deleted one. The
// revision before the batching deleted everything at once, so this guards the
// batching rather than reproducing an older failure.
export default defineBugCase({
  id: "record/a-required-self-link-ring-of-1000-deletes-in-one-stream",
  title:
    "A ring of 1,000 rows held by a required self-link deletes in one stream",
  runner: "required-self-link-ring-delete",
  timeoutMs: 300_000,
  bug: {
    issue: "sentinel/required-self-link-ring-delete",
    status: "fixed",
    sourceCommits: ["5150387a6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-self-link-ring",
    ringSize: 1000,
    selection: "ids",
    writeBatchSize: 200,
  },
});
