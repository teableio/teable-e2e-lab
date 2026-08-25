import { defineBugCase } from "../../framework/types";

// T4988: what travels when a base is exported is a dump of the table as it is
// stored, and a table stored for a while has been edited. A removed column can
// leave its storage behind, invisible to everyone. Importing that dump lost
// rows - not all of them, and with no error: the import reports success, the
// tables and columns are there, and the count is short. Nobody counts rows
// after a migration.
export default defineBugCase({
  id: "base-share/rows-survive-a-round-trip-with-a-leftover-column",
  title: "Every row survives a base round trip past a leftover column",
  runner: "base-import-ghost-column",
  timeoutMs: 300_000,
  bug: {
    issue: "T4988",
    status: "fixed",
    sourceCommits: ["001d7afe7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-ghost-column",
    rowNames: ["first-row", "second-row", "third-row"],
    ghostColumnName: "left_behind_column",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
