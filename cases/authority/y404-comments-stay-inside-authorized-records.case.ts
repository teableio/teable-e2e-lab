import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "authority/y404-comments-stay-inside-authorized-records",
  title: "A matrix member can comment only on records they may read",
  runner: "authority-comment-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T7034",
    status: "fixed",
    sourceCommits: ["38d0e067e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y404-comment-scope",
    allowedTitle: "authorized-record",
    deniedTitle: "unauthorized-record",
    commentText: "authorized-comment",
  },
});
