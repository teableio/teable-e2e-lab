import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "authority/y166-y168-restricted-saved-view-stays-usable",
  title: "Restricted saved and public views both remain usable",
  runner: "authority-persisted-view-query",
  timeoutMs: 180_000,
  bug: {
    issue: "T6967",
    status: "fixed",
    sourceCommits: ["20c05fa89"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y166-y168-saved-view",
  },
});
