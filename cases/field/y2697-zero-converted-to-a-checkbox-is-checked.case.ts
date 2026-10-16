import { defineBugCase } from "../../framework/types";

// T7844: Converting a number column to a checkbox left the rows holding 0
// unchecked, treating a recorded zero the same as no value at all.
export default defineBugCase({
  id: "field/y2697-zero-converted-to-a-checkbox-is-checked",
  title:
    "A number converted to a checkbox checks every row that held a number, zero included",
  runner: "field-conversion-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7844",
    status: "fixed",
    sourceCommits: ["cb38fa722"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-number-to-checkbox",
    source: {
      type: "number",
    },
    target: {
      type: "checkbox",
    },
    rows: [
      {
        name: "zero",
        before: 0,
        after: true,
      },
      {
        name: "five",
        before: 5,
        after: true,
      },
      {
        name: "negative",
        before: -1,
        after: true,
      },
      {
        name: "empty",
        before: null,
        after: null,
      },
    ],
  },
});
