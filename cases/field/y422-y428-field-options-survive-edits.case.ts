import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "field/y422-y428-field-options-survive-edits",
  title: "Y422-Y428: Field options survive unrelated edits",
  runner: "field-option-preservation",
  timeoutMs: 180_000,
  bug: {
    issue: "T6956",
    status: "fixed",
    sourceCommits: ["ed1dc355a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-field-options",
    coveredCaseIds: ["Y422", "Y423", "Y424", "Y425", "Y426", "Y427", "Y428"],
  },
});
