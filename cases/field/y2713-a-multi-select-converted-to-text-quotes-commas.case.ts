import { defineBugCase } from "../../framework/types";

// T7836: Converting a multi-select to text joined the options with ", " and
// left an option that itself contains a comma unquoted, so one option read as
// two.
export default defineBugCase({
  id: "field/y2713-a-multi-select-converted-to-text-quotes-commas",
  title: "A multi-select converted to text quotes options that contain a comma",
  runner: "field-conversion-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7836",
    status: "fixed",
    sourceCommits: ["b912f11fe"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-multi-to-text",
    source: {
      type: "multipleSelect",
      options: {
        choices: [
          {
            name: "A",
          },
          {
            name: "B, C",
          },
        ],
      },
    },
    target: {
      type: "singleLineText",
    },
    rows: [
      {
        name: "two-options",
        before: ["A", "B, C"],
        after: 'A, "B, C"',
      },
      {
        name: "one-option",
        before: ["A"],
        after: "A",
      },
    ],
  },
});
