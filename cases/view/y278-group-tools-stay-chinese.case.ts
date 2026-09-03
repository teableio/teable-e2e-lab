import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "view/y278-group-tools-stay-chinese",
  title: "Grouped grid controls stay in the user's Chinese locale",
  runner: "group-locale-browser",
  timeoutMs: 300_000,
  bug: {
    issue: "T6933",
    status: "fixed",
    sourceCommits: ["88c90783b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y278-group-locale",
    settleTimeoutMs: 30_000,
  },
});
