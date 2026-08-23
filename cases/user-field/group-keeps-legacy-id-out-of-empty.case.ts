import { defineBugCase } from "../../framework/types";

// T6626, the shape the identity expression could not read: a user cell whose
// whole value is the bare user id, written before user cells carried a
// snapshot at all. Reading id and title through object accessors turned every
// one of those cells into NULL, so the collaborator on them was filed under
// the empty group - shown in the grid as "no assignee" on rows that plainly
// have one.
export default defineBugCase({
  id: "user-field/group-keeps-legacy-id-out-of-empty",
  title:
    "A user cell holding a bare user id groups as that person, not as empty",
  runner: "user-group-identity",
  timeoutMs: 180_000,
  bug: {
    issue: "T6626",
    status: "fixed",
    sourceCommits: ["07ace9911"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-group-legacy-id",
    multiple: false,
    rows: [
      { name: "unassigned-one", stored: "empty", bucket: "empty" },
      { name: "unassigned-two", stored: "empty", bucket: "empty" },
      { name: "legacy-id-cell", stored: "scalarId", bucket: "collaborator" },
    ],
    broken: {
      kind: "partition",
      buckets: [["unassigned-one"], ["unassigned-two", "legacy-id-cell"]],
    },
  },
});
