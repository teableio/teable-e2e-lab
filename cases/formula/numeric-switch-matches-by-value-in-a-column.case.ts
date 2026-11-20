import { defineBugCase } from "../../framework/types";

// T8627: SWITCH over a number column shown with two decimals matched no branch,
// so every row took the default in a stored formula column.
export default defineBugCase({
  id: "formula/numeric-switch-matches-by-value-in-a-column",
  title:
    "SWITCH over a formatted number takes the branch its value names in a formula column",
  runner: "numeric-switch-matching",
  timeoutMs: 180_000,
  bug: {
    issue: "T8627",
    status: "fixed",
    sourceCommits: ["8bae75153"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-numeric-switch",
    precision: 2,
    rows: [
      { label: "r0", n: 0 },
      { label: "r1", n: 1 },
      { label: "r2", n: 2 },
      { label: "r3", n: 3 },
      { label: "r4", n: 1.004 },
      { label: "r5", n: null },
    ],
    formulas: [
      {
        name: "Number result",
        expression: "SWITCH({n}, 1, 1, 2, 3, 4)",
        expected: [4, 1, 3, 4, 4, 4],
      },
      {
        name: "Text result",
        expression: 'SWITCH({n}, 1, "x", 2, "y", "z")',
        expected: ["z", "x", "y", "z", "z", "z"],
      },
      {
        name: "Column result",
        expression: 'SWITCH({n}, 1, "x", 2, {a}, {a} & "z")',
        expected: ["r0z", "x", "r2", "r3z", "r4z", "r5z"],
      },
    ],
  },
});
