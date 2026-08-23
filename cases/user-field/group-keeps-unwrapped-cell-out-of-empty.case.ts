import { defineBugCase } from "../../framework/types";

// T6626, the same loss reached by a change anyone can make from the field
// editor: switching a user field from single to multiple leaves the existing
// cells holding one object rather than a one-element array. The identity
// expression mapped any non-array cell in a multi-value column to NULL, so
// every row written before the switch joined the empty group, while rows
// written after it grouped normally.
export default defineBugCase({
  id: "user-field/group-keeps-unwrapped-cell-out-of-empty",
  title:
    "A multi-user cell left unwrapped by a conversion groups as its person",
  runner: "user-group-identity",
  timeoutMs: 180_000,
  bug: {
    issue: "T6626",
    status: "fixed",
    sourceCommits: ["07ace9911"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-group-unwrapped",
    multiple: true,
    rows: [
      { name: "unassigned", stored: "empty", bucket: "empty" },
      {
        name: "written-after-the-switch",
        stored: "assigned",
        bucket: "collaborator",
      },
      { name: "left-unwrapped", stored: "bareObject", bucket: "collaborator" },
    ],
    broken: {
      kind: "partition",
      buckets: [
        ["unassigned"],
        ["written-after-the-switch"],
        ["left-unwrapped"],
      ],
    },
  },
});
