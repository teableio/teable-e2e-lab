import { defineBugCase } from "../../framework/types";

// T8332: Duplicating a base recomputed its filtered rollups over single-select
// values wrongly, so the copy disagreed with the original.
export default defineBugCase({
  id: "base-share/y3215-a-duplicated-base-keeps-its-filtered-rollups",
  title: "A duplicated base keeps the counts of its filtered rollups",
  runner: "duplicate-base-filtered-rollup",
  timeoutMs: 180_000,
  bug: {
    issue: "T8332",
    status: "fixed",
    sourceCommits: ["3372dd9b2"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-duplicate-filtered-rollup",
    children: [
      {
        name: "Mixed pending",
        status: "Pending",
        parent: "Mixed",
      },
      {
        name: "Mixed active",
        status: "Active",
        parent: "Mixed",
      },
      {
        name: "Mixed removed",
        status: "Removed",
        parent: "Mixed",
      },
      {
        name: "Zero removed",
        status: "Removed",
        parent: "Zero",
      },
    ],
    rollups: [
      {
        name: "Pending count",
        operator: "is",
        value: "Pending",
      },
      {
        name: "Not removed count",
        operator: "isNot",
        value: "Removed",
      },
      {
        name: "Open count",
        operator: "isAnyOf",
        value: ["Pending", "Active"],
      },
    ],
    expected: {
      Mixed: {
        "Pending count": 1,
        "Not removed count": 2,
        "Open count": 2,
      },
      Zero: {
        "Pending count": 0,
        "Not removed count": 0,
        "Open count": 0,
      },
    },
    settleAttempts: 20,
    settleIntervalMs: 500,
  },
});
