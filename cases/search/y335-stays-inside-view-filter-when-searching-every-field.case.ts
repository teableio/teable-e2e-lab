import { defineBugCase } from "../../framework/types";

// T6916: the same failure as its sibling, reached the way the grid's search
// box actually reaches it - the term on its own, searched across every column,
// with a date column among them. The view's filter was dropped, so the search
// answered with rows the person had filtered away; they are in a view for a
// reason, and the search is the one place where that reason is easiest to
// forget.
//
// The sibling `search/y189-stays-inside-view-filter` names one column to search and
// was green on this fix's parent (run 32703022098), which is why this shape
// needed a case of its own.
export default defineBugCase({
  id: "search/y335-stays-inside-view-filter-when-searching-every-field",
  title: "Searching every field stays inside the view filter",
  runner: "search-view-filter",
  timeoutMs: 120_000,
  bug: {
    issue: "T6916",
    status: "fixed",
    sourceCommits: ["e686cd95d"],
  },
  config: {
    baseId: "seed-base",
    scope: "everyField",
    tableNamePrefix: "e2e-lab-search-every-field",
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
