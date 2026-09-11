import { defineBugCase } from "../../framework/types";

// T4966: a row's history entries are written after the request answers, on a
// queue shared by everyone working in that base. Who made the change was read
// at the moment the queue was drained rather than carried on the change itself,
// so whoever's request happened to trigger the drain was stamped onto
// everybody's entries. One person working alone never sees it; two people
// working at once get each other's names against their changes.
export default defineBugCase({
  id: "audit-fields/y886-a-rows-history-names-who-changed-it",
  title: "A row's history names the person who changed it",
  runner: "record-history-actor",
  timeoutMs: 300_000,
  bug: {
    issue: "T4966",
    status: "fixed",
    sourceCommits: ["585c58973"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-history-actor",
    rowsPerWriter: 6,
    historyTimeoutMs: 30_000,
    pollIntervalMs: 500,
  },
});
