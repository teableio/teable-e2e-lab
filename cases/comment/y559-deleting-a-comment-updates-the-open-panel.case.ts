import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "comment/y559-deleting-a-comment-updates-the-open-panel",
  title: "Deleting a comment updates the open panel immediately",
  runner: "comment-delete-browser",
  timeoutMs: 300_000,
  bug: {
    issue: "T7035",
    status: "fixed",
    sourceCommits: ["38d0e067e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y559-comment-delete",
    deletedText: "y559-delete-me",
    retainedText: "y559-keep-me",
    settleTimeoutMs: 30_000,
    quietPeriodMs: 3_000,
  },
});
