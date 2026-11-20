import { defineBugCase } from "../../framework/types";

// T8647: Two requests that permanently deleted the same base from the trash at
// the same moment raced, and the one that lost failed with a server error.
export default defineBugCase({
  id: "space/purging-a-base-twice-at-once-never-fails",
  title: "Permanently deleting one base several times at once never fails",
  runner: "concurrent-base-purge",
  timeoutMs: 300_000,
  bug: {
    issue: "T8647",
    status: "fixed",
    sourceCommits: ["405cc008f"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-base-purge",
    concurrentPurges: 3,
    tablesPerBase: 3,
    rowsPerTable: 50,
    trashAttempts: 20,
    trashIntervalMs: 500,
  },
});
