import { defineBugCase } from "../../framework/types";

// T6874: searching a view found rows the view does not show. Search-count and
// search-index applied only the filter the client sent in the request, so a
// request that named a view and nothing else searched the entire table - the
// grid's own search box sends exactly that request, and answered with hits on
// rows the user had filtered away.
export default defineBugCase({
  id: "search/y189-stays-inside-view-filter",
  title: "Searching a view finds only rows the view shows",
  runner: "search-view-filter",
  timeoutMs: 120_000,
  bug: {
    issue: "T6874",
    status: "fixed",
    sourceCommits: ["a0531e540"],
  },
  config: {
    baseId: "seed-base",
    scope: "oneField",
    tableNamePrefix: "e2e-lab-search-view-filter",
    searchTerm: "Cupcake",
    // All four quadrants of (inside the view, matched by the search). The
    // three the runner requires are here twice over, so a single mis-seeded
    // row cannot silently collapse the fixture into a shape that only looks
    // answerable.
    rows: [
      { name: "kept-match", inView: true, matches: true },
      { name: "kept-other", inView: true, matches: false },
      { name: "hidden-match", inView: false, matches: true },
      { name: "hidden-other", inView: false, matches: false },
      { name: "kept-match-two", inView: true, matches: true },
      { name: "hidden-match-two", inView: false, matches: true },
    ],
  },
});
