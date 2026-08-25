import { defineBugCase } from "../../framework/types";

// T6923: a column that borrows a link from another table shows names, the same
// as the link column it borrows from. Typing part of one of those names into
// "contains" found nothing - not the wrong rows, nothing, on every search,
// while the names being searched sat visible in the column. No error, nothing
// to report, and the natural reading is that the rows are not there.
export default defineBugCase({
  id: "filter/search-a-borrowed-link-column",
  title: "A borrowed link column can be filtered by part of a name",
  runner: "lookup-of-link-contains",
  timeoutMs: 180_000,
  bug: {
    issue: "T6923",
    status: "fixed",
    sourceCommits: ["c02b22f73"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-link-search",
    targetNames: ["quartz-supply", "bowline-freight"],
    searchTerm: "quartz",
  },
});
