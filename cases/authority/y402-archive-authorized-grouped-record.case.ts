import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "authority/y402-archive-authorized-grouped-record",
  title: "A matrix member archives an authorized row in a grouped sorted view",
  runner: "authority-archive-record",
  timeoutMs: 240_000,
  bug: {
    issue: "T7025",
    status: "fixed",
    sourceCommits: ["68b7d74f0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y402-authority-archive",
  },
});
