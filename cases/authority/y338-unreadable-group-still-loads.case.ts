import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "authority/y338-unreadable-group-still-loads",
  title:
    "Y338: Restricted grouped grids load and keep their permitted behavior",
  runner: "authority-unreadable-group",
  timeoutMs: 600_000,
  bug: {
    issue: "T6944",
    status: "fixed",
    sourceCommits: ["04af0858e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y338",
    rows: [
      { title: "alpha", group: "kind-a", status: "open" },
      { title: "beta", group: "kind-b", status: "closed" },
      { title: "gamma", group: "kind-a", status: "open" },
    ],
    subscribeTimeoutMs: 30_000,
    settleTimeoutMs: 60_000,
  },
});
