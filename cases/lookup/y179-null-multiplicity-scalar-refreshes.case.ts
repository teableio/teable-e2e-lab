import { defineBugCase } from "../../framework/types";

// T6786: a lookup whose `is_multiple_cell_value` was NULL rather than false
// got read as multi-valued, so computed updates projected jsonb into a column
// that is plain TEXT and Postgres answered `operator does not exist: text =
// jsonb`. The task classified as computed_code_bug - not retryable - so it
// went straight to the dead letter table, and every later edit produced
// another. On the reporting instance 33 computed fields on one table sat
// permanently red.
export default defineBugCase({
  id: "lookup/y179-null-multiplicity-scalar-refreshes",
  title: "A scalar lookup with unset multiplicity still refreshes",
  runner: "null-multiplicity-lookup",
  timeoutMs: 300_000,
  bug: {
    issue: "T6786",
    status: "fixed",
    sourceCommits: ["f72c3ce87"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-null-multiplicity",
    observe: "recompute",
    sourceValue: "alpha",
    sourceValueAfter: "beta",
    settleTimeoutMs: 60_000,
    settlePollIntervalMs: 1_000,
  },
});
