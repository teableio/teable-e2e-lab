import { defineBugCase } from "../../framework/types";

// T6861: a computed refresh wrote NULL into the display column of a required
// manyOne link whose foreign key had already been cleared. The column is NOT
// NULL, Postgres answered 23502, and the statement failed as a unit — so the
// manyMany link refreshing in the same batch, which had nothing wrong with it,
// never updated either. The task dead-lettered as a data-constraint failure,
// which the admin console will not replay.
export default defineBugCase({
  id: "link/required-link-keeps-sibling-refresh",
  title:
    "A required link with no foreign key does not block its sibling's refresh",
  runner: "required-link-refresh",
  timeoutMs: 180_000,
  bug: {
    issue: "T6861",
    status: "fixed",
    sourceCommits: ["1fc507346"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-required-link-fk",
    linkedTitle: "linked-title",
    otherTitle: "other-title",
    otherTitleAfter: "other-title-updated",
    settleTimeoutMs: 30_000,
    settlePollIntervalMs: 500,
  },
});
