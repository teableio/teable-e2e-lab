import { defineBugCase } from "../../framework/types";

// T7823: Writing `"A, B", C` with typecast into a multi-select split on every
// comma, so the row got three options and the column gained fragments nobody
// named.
export default defineBugCase({
  id: "record/y2731-a-typecast-option-keeps-its-quoted-comma",
  title: "A typecast multi-select value keeps a quoted comma inside one option",
  runner: "typecast-write-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7823",
    status: "fixed",
    sourceCommits: ["5255dd724"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-typecast-quoted",
    field: {
      type: "multipleSelect",
      options: {
        choices: [],
      },
    },
    input: '"A, B", C',
    expectedValue: ["A, B", "C"],
    expectedNewChoices: ["A, B", "C"],
  },
});
