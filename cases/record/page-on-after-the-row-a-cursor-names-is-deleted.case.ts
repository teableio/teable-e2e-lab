import { defineBugCase } from "../../framework/types";

// T7311: a list cursor found its place by looking up the last row of the
// previous page again. Once that row was deleted, the next page came back
// empty and a client paging through the table stopped early, missing every
// row after it.
export default defineBugCase({
  id: "record/page-on-after-the-row-a-cursor-names-is-deleted",
  title: "Paging on with a cursor after its row is deleted",
  runner: "cursor-after-deleted-anchor",
  timeoutMs: 120_000,
  bug: {
    issue: "T7311",
    status: "fixed",
    sourceCommits: ["cb1d86bff"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-cursor-deleted-anchor",
    rowCount: 12,
    pageSize: 4,
  },
});
