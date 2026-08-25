import { defineBugCase } from "../../framework/types";

// Y279 / T6936: link `is` stores a record id while `contains` stores title
// text. Keeping the old value across the operator switch exposed the record id
// in the filter panel and made the resulting filter meaningless.
export default defineBugCase({
  id: "filter/y279-link-contains-shows-title",
  title:
    "A link contains filter shows and applies a record title, never its id",
  runner: "link-filter-operator-reset",
  timeoutMs: 240_000,
  bug: {
    issue: "T6936",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3153",
    sourceCommits: ["85441ac71"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y279",
    matchingTitle: "Y279 Alpha Linked Record",
    otherTitle: "Y279 Beta Linked Record",
    settleTimeoutMs: 30_000,
  },
});
