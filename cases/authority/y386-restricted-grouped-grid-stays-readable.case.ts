import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "authority/y386-restricted-grouped-grid-stays-readable",
  title: "A restricted grouped grid keeps only its readable group levels",
  runner: "authority-unreadable-group",
  timeoutMs: 600_000,
  bug: {
    issue: "T6993",
    status: "fixed",
    sourceCommits: ["fe2bac20f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y386-restricted-group",
    rows: [
      { title: "alpha", group: "kind-a", status: "open" },
      { title: "beta", group: "kind-b", status: "closed" },
      { title: "gamma", group: "kind-a", status: "open" },
    ],
    subscribeTimeoutMs: 30_000,
    settleTimeoutMs: 60_000,
  },
});
