import { defineBugCase } from "../../framework/types";

// T6522, the other half of the same fix. A base can hold automations,
// webhooks and apps and no table yet - that is what a base looks like early,
// and what an integration-only base looks like permanently. Importing one was
// refused outright, so the copy could not be made at all.
export default defineBugCase({
  id: "base-share/import-of-a-base-without-tables",
  title: "A base with no tables can still be imported",
  runner: "base-import-field-description",
  timeoutMs: 300_000,
  bug: {
    issue: "T6522",
    status: "fixed",
    sourceCommits: ["7e765de97"],
  },
  config: {
    shape: "noTables",
    namePrefix: "e2e-lab-base-notables",
    rowTitle: "unused",
    describedFields: [],
    undescribedFieldName: "unused",
  },
});
