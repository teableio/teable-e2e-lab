import { defineBugCase } from "../../framework/types";

// T7759: pasting a name that matches no row into a link whose far table is
// keyed by a row number was refused as a generic validation failure about
// resolving a title, rather than with the reason the person can act on.
export default defineBugCase({
  id: "selection/y2876-paste-into-a-link-to-numbered-rows",
  title:
    "Pasting a new name into a link to numbered rows is refused for the right reason",
  runner: "link-paste-autocreate",
  timeoutMs: 180_000,
  bug: {
    issue: "T7759",
    status: "fixed",
    sourceCommits: ["6afd67b0b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-numbered",
    scenario: "computed-primary",
    targetNames: ["first"],
    pastedName: "not-a-row",
    expectedCode: "paste.link_auto_create_computed_primary_unsupported",
  },
});
