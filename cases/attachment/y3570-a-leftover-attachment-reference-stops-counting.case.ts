import { defineBugCase } from "../../framework/types";

// T8149: Reference rows left behind by attachment fields deleted before
// references were cleaned up kept counting against the space's attachment
// usage, because usage summed every reference row whether or not its field
// still existed. A field that is deleted but still in the trash must keep
// counting.
export default defineBugCase({
  id: "attachment/y3570-a-leftover-attachment-reference-stops-counting",
  title:
    "A leftover reference to a deleted field stops counting against the space",
  runner: "attachment-reference-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "T8149",
    status: "fixed",
    sourceCommits: ["ef3dc7b39"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-attach-orphaned-reference",
    scenario: "orphaned-reference",
    goneBytes: 4096,
    keptBytes: 1000,
    trashAttempts: 100,
    trashIntervalMs: 100,
  },
});
