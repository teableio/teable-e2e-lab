import { defineBugCase } from "../../framework/types";

// T5067: hiding a column is how a view is made narrow enough to work in. The
// count next to the search box and the list underneath are the same answer
// written two ways, and they disagreed: rows matching only in the hidden
// column were counted and not shown. The difference is made of exactly the
// rows the view is not showing, so there is no way to reconcile them.
export default defineBugCase({
  id: "search/how-many-results-with-a-column-hidden",
  title: "The number of search results counts only what is shown",
  runner: "row-count-search-projection",
  timeoutMs: 180_000,
  bug: {
    issue: "T5067",
    status: "fixed",
    sourceCommits: ["7a337a3c0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-row-count-projection",
    rows: [
      { title: "apple", note: "banana" },
      { title: "banana", note: "cherry" },
    ],
    searchTerm: "banana",
  },
});
