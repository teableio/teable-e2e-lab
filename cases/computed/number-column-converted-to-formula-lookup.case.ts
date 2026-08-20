import { defineBugCase } from "../../framework/types";

// T6765: converting a number column into a lookup left the rebuilt lookup
// carrying the old metadata - REAL/DATETIME/TEXT copied across a conversion
// that changed the physical shape. The backfill then generated its assignment
// from that metadata and Postgres refused it, killing the table.update
// operation. The column simply never filled in.
export default defineBugCase({
  id: "computed/number-column-converted-to-formula-lookup",
  title: "A number column converted into a formula lookup fills in",
  runner: "computed-backfill-recast",
  timeoutMs: 180_000,
  bug: {
    issue: "T6765",
    status: "fixed",
    sourceCommits: ["a9f56d9d5"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-recast-number-lookup",
    shape: "number-to-formula-lookup",
    peerTitle: "peer-a",
    sourceNumber: 12.5,
    placeholderNumber: 1,
    // Well past any per-row fast path: the bug lives in the batch statement.
    rowCount: 40,
    settleTimeoutMs: 45_000,
    settlePollIntervalMs: 750,
  },
});
