import { defineBugCase } from "../../framework/types";

// T6626: grouping by a user field grouped by the stored cell, and a user cell
// is a write-time snapshot of the collaborator. One person who has changed
// their email or gained an avatar therefore arrives as several different
// values, and the grid drew one group header per snapshot generation - the
// same collaborator repeated down the group list, their rows split between
// the copies.
export default defineBugCase({
  id: "user-field/group-folds-drifted-snapshots",
  title:
    "Grouping by a user field folds one collaborator's snapshots into one group",
  runner: "user-group-identity",
  timeoutMs: 180_000,
  bug: {
    issue: "T6626",
    status: "fixed",
    sourceCommits: ["07ace9911"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-group-drift",
    multiple: false,
    rows: [
      { name: "current-snapshot", stored: "assigned", bucket: "collaborator" },
      {
        name: "older-email",
        stored: "drifted",
        snapshotExtras: { email: "older-address@example.com" },
        bucket: "collaborator",
      },
      {
        name: "oldest-email",
        stored: "drifted",
        snapshotExtras: { email: "oldest-address@example.com" },
        bucket: "collaborator",
      },
    ],
    brokenBuckets: [["current-snapshot"], ["older-email"], ["oldest-email"]],
  },
});
