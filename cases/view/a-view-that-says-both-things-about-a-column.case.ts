import { defineBugCase } from "../../framework/types";

// T6597: which columns a view shows has been recorded two ways over this
// product's life - an older note saying whether a column is SHOWN, and the
// current one saying whether it is HIDDEN. Views made long enough ago carry both,
// and nothing writes that shape any more; it is simply what is in the table. Read
// back, the two were passed through side by side, and what a view says about a
// column is checked on the way out - so the request for the table's views failed,
// which is every view at once rather than one column in one of them.
export default defineBugCase({
  id: "view/a-view-that-says-both-things-about-a-column",
  title: "A view carrying both notes about a column still reads",
  runner: "legacy-column-visibility-metadata",
  timeoutMs: 180_000,
  bug: {
    issue: "T6597",
    status: "fixed",
    sourceCommits: ["bded2fd80"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-column-meta",
    rowTitle: "a-row-in-the-table",
    legacy: "bothVisibilityNotes",
    order: 1,
    width: 241,
  },
});
