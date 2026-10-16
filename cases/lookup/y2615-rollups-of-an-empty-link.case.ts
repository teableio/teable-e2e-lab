import { defineBugCase } from "../../framework/types";

// T7821: Over an empty link, an average read 0 and an exclusive-or read false,
// and a row whose links were all removed kept reading 0 and false.
export default defineBugCase({
  id: "lookup/y2615-rollups-of-an-empty-link",
  title:
    "Rollups over an empty link are empty where nothing was there to aggregate",
  runner: "empty-link-rollups",
  timeoutMs: 180_000,
  bug: {
    issue: "T7821",
    status: "fixed",
    sourceCommits: ["b6f2d8ef7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-empty-link-rollups",
    items: [
      {
        name: "checked",
        amount: 10,
        flag: true,
      },
      {
        name: "unchecked",
        amount: 20,
        flag: false,
      },
    ],
  },
});
