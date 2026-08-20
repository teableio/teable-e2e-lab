import { defineBugCase } from "../../framework/types";

// T6641: v2's record-read hydration enriched public user cells but
// deliberately skipped `lastModifiedBy`. Cells carrying their own snapshot
// were unaffected, so the gap only showed on the ones that do not: a legacy
// cell holding the bare user id, and a NULL cell whose editor is known only
// from the system audit column. Both fell back to the id as the display
// title, and the record card showed `usreOCcpI0QR2B2XLLr` where a name
// belongs.
export default defineBugCase({
  id: "audit-fields/last-modified-by-resolves-name",
  title: "LastModifiedBy shows the editor's name, not their raw user id",
  runner: "audit-user-name-resolves",
  timeoutMs: 180_000,
  bug: {
    issue: "T6641",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-audit-user",
    legacyRowTitle: "legacy-raw-id-cell",
    missingSnapshotRowTitle: "missing-snapshot-cell",
  },
});
