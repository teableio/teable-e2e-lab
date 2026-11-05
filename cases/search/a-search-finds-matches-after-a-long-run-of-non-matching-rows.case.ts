import { defineBugCase } from "../../framework/types";

// T8327: The search-matches page counted view rows, not matching rows, so a
// search whose hits were all near the end of a large table came back with no
// matches on its first page and the grid kept paging and spinning.
export default defineBugCase({
  id: "search/a-search-finds-matches-after-a-long-run-of-non-matching-rows",
  title:
    "A search finds matches that sit after a long run of non-matching rows",
  runner: "search-matches-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T8327",
    status: "fixed",
    sourceCommits: ["5f7bc39d9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-search-sparse-tail",
    scenario: "sparse-tail",
    rowCount: 1000,
    needleRows: 3,
    needle: "needle-late",
    take: 100,
    selectedRecordCount: 0,
  },
});
