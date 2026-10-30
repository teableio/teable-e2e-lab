import { defineBugCase } from "../../framework/types";

// sentinel/attachment-usage-record-deleted: Permanently deleting a row (delete
// it, then empty the table's trash) must take its attachments out of the
// space's attachment usage. Guarded alongside the T8166 fix.
export default defineBugCase({
  id: "attachment/a-deleted-attachment-row-stops-counting",
  title:
    "A permanently deleted row's attachments stop counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/attachment-usage-record-deleted",
    status: "fixed",
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-record-deleted",
    scenario: "record-deleted",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
