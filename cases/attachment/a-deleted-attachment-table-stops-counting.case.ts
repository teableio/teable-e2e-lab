import { defineBugCase } from "../../framework/types";

// sentinel/attachment-usage-table-deleted: Permanently deleting a table (delete
// it, then empty the base's trash) must take its attachments out of the space's
// attachment usage. Guarded alongside the T8166 fix.
export default defineBugCase({
  id: "attachment/a-deleted-attachment-table-stops-counting",
  title:
    "A permanently deleted table's attachments stop counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/attachment-usage-table-deleted",
    status: "fixed",
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-table-deleted",
    scenario: "table-deleted",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
