import { defineBugCase } from "../../framework/types";

// T7087: the same missing check one column type over. A conditional total picks
// its source by matching rows rather than by following a link, and that path
// had its own create handling - so the validation added for ordinary totals did
// not cover it. The report is a field created through the API with a button as
// its source: it read 0.00 on every row, and reopening it showed no source at
// all.
export default defineBugCase({
  id: "field/a-conditional-total-its-source-cannot-give",
  title: "A conditional total its source column cannot give is refused",
  runner: "rollup-create-compatibility",
  timeoutMs: 180_000,
  skipV1:
    "conditional totals are a v2 column type - v1 has neither the field nor the create validation",
  bug: {
    issue: "T7087",
    status: "fixed",
    sourceCommits: ["a7c1edd14"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-cond-rollup-compat",
    column: "conditionalRollup",
    matchKey: "the-only-group",
    attempts: [
      {
        name: "a count of buttons",
        source: "button",
        expression: "counta({values})",
      },
      {
        name: "all of a number",
        source: "number",
        expression: "and({values})",
      },
      {
        name: "the sum of a tickbox",
        source: "checkbox",
        expression: "sum({values})",
      },
    ],
  },
});
