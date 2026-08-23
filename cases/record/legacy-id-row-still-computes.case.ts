import { defineBugCase } from "../../framework/types";

// T6621: v1 only enforced the `rec` prefix on record ids, so an imported or
// migrated base can hold rows whose id body is not the 16 characters this
// version generates. v2 parsed ids strictly, and a row it could not parse
// failed its computed update deterministically - the same failure every time,
// classified as a code bug and sent straight to the dead letter table. From
// inside the product it looks like a table where some rows compute and others
// never do, with nothing on screen to tell them apart.
export default defineBugCase({
  id: "record/legacy-id-row-still-computes",
  title: "A row carrying a pre-migration record id still recomputes",
  runner: "legacy-record-id",
  timeoutMs: 300_000,
  bug: {
    issue: "T6621",
    status: "fixed",
    sourceCommits: ["2d5a3483b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-record-id",
    // Eight characters of body where this version writes sixteen.
    legacyRecordId: "recLegacy",
    ordinaryRowCount: 3,
    seedValue: "before",
    updatedValue: "after",
    settleTimeoutMs: 90_000,
    settlePollIntervalMs: 1_000,
  },
});
