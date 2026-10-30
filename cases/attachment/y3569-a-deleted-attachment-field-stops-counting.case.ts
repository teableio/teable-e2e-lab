import { defineBugCase } from "../../framework/types";

// T8166: Permanently deleting an attachment field (delete it, then empty the
// table's trash) left its attachment references behind, so its files kept
// counting against the space's attachment usage.
export default defineBugCase({
  id: "attachment/y3569-a-deleted-attachment-field-stops-counting",
  title:
    "A permanently deleted attachment field stops counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "T8166",
    status: "fixed",
    sourceCommits: ["b0e31cd28"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-field-deleted",
    scenario: "field-deleted",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
