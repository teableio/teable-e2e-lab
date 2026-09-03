import { defineBugCase } from "../../framework/types";

// T7046: the field editor knows which functions each column type supports and
// offers only those. The API did not check, so a total that no source could
// produce - the sum of a tickbox, a total over a button - was accepted and
// written. What came back was a column reading 0.00 on every row whose editor
// opened with an empty source box and nothing selectable in it: it could not be
// corrected, only deleted. Automations and integrations write fields through
// this endpoint and never see the editor.
export default defineBugCase({
  id: "field/a-total-its-source-cannot-give",
  title: "A total its source column cannot give is refused, not created",
  runner: "rollup-create-compatibility",
  timeoutMs: 180_000,
  skipV1:
    "v1 does not validate field creates at all, so it answers the same on both sides of this fix and the column it leaves is a different artefact",
  bug: {
    issue: "T7046",
    status: "fixed",
    sourceCommits: ["4bb07b0b6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rollup-compat",
    column: "rollup",
    matchKey: "the-only-group",
    attempts: [
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
      {
        name: "a count of buttons",
        source: "button",
        expression: "countall({values})",
      },
    ],
  },
});
