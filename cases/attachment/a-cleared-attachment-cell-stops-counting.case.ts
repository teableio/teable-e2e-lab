import { defineBugCase } from "../../framework/types";

// sentinel/attachment-usage-cell-cleared: Clearing an attachment cell must take
// its file out of the space's attachment usage. Guarded alongside the T8166
// fix.
export default defineBugCase({
  id: "attachment/a-cleared-attachment-cell-stops-counting",
  title: "A cleared attachment cell stops counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/attachment-usage-cell-cleared",
    status: "fixed",
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-cell-cleared",
    scenario: "cell-cleared",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
