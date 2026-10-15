import { defineBugCase } from "../../framework/types";

// T7743: Pasting a name that matches no row into a link that shows a
// non-primary column reported success and did nothing.
export default defineBugCase({
  id: "selection/y2900-paste-into-a-link-showing-another-column",
  title:
    "Pasting a new name into a link showing a non-primary column is refused",
  runner: "link-paste-autocreate",
  timeoutMs: 180_000,
  bug: {
    issue: "T7743",
    status: "fixed",
    sourceCommits: ["6afd67b0b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-display",
    scenario: "non-primary-title",
    targetNames: ["apple", "banana", "orange"],
    pastedName: "new-product",
    expectedCode: "paste.link_auto_create_requires_primary_lookup",
  },
});
