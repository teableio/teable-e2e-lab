import { defineBugCase } from "../../framework/types";

// sentinel/attachment-usage-base-deleted: Permanently deleting a base (delete
// it, then delete it from the space's trash) must take its attachments out of
// the space's attachment usage. Guarded alongside the T8166 fix.
export default defineBugCase({
  id: "attachment/a-deleted-attachment-base-stops-counting",
  title:
    "A permanently deleted base's attachments stop counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/attachment-usage-base-deleted",
    status: "fixed",
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-base-deleted",
    scenario: "base-deleted",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
