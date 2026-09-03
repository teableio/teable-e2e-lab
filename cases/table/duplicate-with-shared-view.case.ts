import { defineBugCase } from "../../framework/types";

// T6573: sharing a view mints a credential that is unique across the whole
// instance - it is the address of a public page. Duplicating the table copied
// every view as it was, that credential included, and the insert met the
// unique index on it. The duplicate answered 500 and no copy was made: one
// shared view anywhere in a table made the whole table impossible to
// duplicate, with nothing in the message about sharing.
export default defineBugCase({
  id: "table/duplicate-with-shared-view",
  title:
    "A table with a shared view can be duplicated, and the copy gets its own link",
  runner: "duplicate-shared-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T6573",
    status: "fixed",
    sourceCommits: ["da43a20a2"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-shared-view-copy",
    rowTitle: "row-1",
    assert: "copyHasItsOwnLink",
  },
});
