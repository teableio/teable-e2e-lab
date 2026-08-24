import { defineBugCase } from "../../framework/types";

// T5102: retiring a choice from a status column is ordinary housekeeping, and
// the rows that held it are supposed to empty out. Nothing was pushed for
// those rows, so every open screen went on showing a status the column no
// longer offers - it cannot be filtered for, because the choice is gone from
// the filter list, and it cannot be chosen again. The row reads as having a
// status that does not exist until someone reloads.
export default defineBugCase({
  id: "realtime/retiring-a-choice-reaches-the-open-page",
  title: "Retiring a choice empties the rows that held it, on the open page",
  runner: "select-option-removal-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T5102",
    status: "fixed",
    sourceCommits: ["7cb99ff95"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-retire-choice",
    retiredChoice: "Blocked",
    keptChoice: "Done",
    retiredRowTitle: "row-that-was-blocked",
    keptRowTitle: "row-that-is-done",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
    pollIntervalMs: 250,
  },
});
