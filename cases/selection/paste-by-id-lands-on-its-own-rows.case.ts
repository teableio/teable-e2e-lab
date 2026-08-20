import { defineBugCase } from "../../framework/types";

// SENTINEL - there is no bug behind this case and no commit where it goes
// red. Read the limits section of the doc before trusting it the way you would
// trust the others here.
//
// Selection paste loaded one record per row, a table load each, and was
// rewritten to batch them into a single query. That rewrite moves the ordering
// guarantee out of the language and into the code: Promise.all over a list
// keeps its order and throws on a missing record, while a batched loader
// returns a map and the clipboard payload stays positional. Any row the loader
// drops now pulls every later value one target up.
//
// The paste would still answer 200 with the right number of cells changed.
export default defineBugCase({
  id: "selection/paste-by-id-lands-on-its-own-rows",
  title: "Pasting by id lands every value on its own row",
  runner: "paste-by-id-alignment",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/paste-by-id-alignment",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-by-id",
    // Well past the point where the loader pages, so a shift caused by
    // batching has room to show rather than hiding inside a single page.
    rowCount: 60,
  },
});
