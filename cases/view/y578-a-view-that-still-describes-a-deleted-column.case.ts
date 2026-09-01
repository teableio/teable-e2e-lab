import { defineBugCase } from "../../framework/types";

// T5457: a view carries a setting per column - how wide it is, whether it is
// hidden, where it sits. Columns get deleted, and a base worked in for a while
// has views whose settings outlived the column they were about. Those settings
// were handed out with the view, so every reader gets a list of columns that
// does not match the table's, naming something nobody can see, and each
// decides for itself what to do with the extra.
export default defineBugCase({
  id: "view/y578-a-view-that-still-describes-a-deleted-column",
  title: "A view describes only columns the table has",
  runner: "stale-view-column-meta",
  timeoutMs: 180_000,
  bug: {
    issue: "T5457",
    status: "fixed",
    sourceCommits: ["e0bf5baef"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-stale-column-meta",
    deletedColumnName: "Retired column",
  },
});
