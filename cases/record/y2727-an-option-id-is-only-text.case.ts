import { defineBugCase } from "../../framework/types";

// T7826: Writing a select option's internal id as the cell value resolved it to
// the option behind it, instead of treating it as the text it is: refused
// without typecast, a new option with typecast.
export default defineBugCase({
  id: "record/y2727-an-option-id-is-only-text",
  title: "An option id written to a select is treated as text",
  runner: "select-choice-id-write",
  timeoutMs: 180_000,
  bug: {
    issue: "T7826",
    status: "fixed",
    sourceCommits: ["5255dd724"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-choice-id",
    choices: ["A", "B"],
  },
});
