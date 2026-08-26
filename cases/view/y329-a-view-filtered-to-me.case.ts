import { defineBugCase } from "../../framework/types";

// T3433: "assigned to me" is the first view most people make and the one they
// open every morning. It is saved once, by one person, and has to mean
// something different for each of them - the filter stores the word "me", not
// a name. The word was passed to the database as itself, matched nobody, and
// the view came back empty. An empty view of your own work reads as "you have
// nothing to do", which is the one wrong answer nobody double-checks.
export default defineBugCase({
  id: "view/y329-a-view-filtered-to-me",
  title: "A view filtered to me shows my rows",
  runner: "me-filter-in-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T3433",
    status: "fixed",
    sourceCommits: ["e38230971"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-me-filter",
    mineRowTitle: "assigned-to-me",
    unassignedRowTitle: "assigned-to-nobody",
  },
});
