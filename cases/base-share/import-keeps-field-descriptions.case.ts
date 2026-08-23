import { defineBugCase } from "../../framework/types";

// T6522: exporting a base and importing it back dropped every field
// description. A field's description is the instruction whoever fills the row
// reads - what counts as done, which currency, whose name goes here. The copy
// arrives with every column and every row in place, so nothing about it looks
// incomplete; the cost lands later, as rows filled in wrong by people who had
// no way to know the rule.
export default defineBugCase({
  id: "base-share/import-keeps-field-descriptions",
  title: "A base carried out and back keeps its field descriptions",
  runner: "base-import-field-description",
  timeoutMs: 300_000,
  bug: {
    issue: "T6522",
    status: "fixed",
    sourceCommits: ["7e765de97"],
  },
  config: {
    shape: "describedFields",
    namePrefix: "e2e-lab-base-desc",
    rowTitle: "the-row",
    describedFields: [
      {
        name: "Invoice total",
        description: "Excluding VAT, in the currency the contract names.",
      },
      {
        name: "Owner",
        description: "The person who signs off, not the person who filed it.",
      },
    ],
    undescribedFieldName: "Notes",
  },
});
