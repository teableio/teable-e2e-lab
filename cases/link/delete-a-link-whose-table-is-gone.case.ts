import { defineBugCase } from "../../framework/types";

// T6539: removing a link column reaches across to the table on the other end
// to clean up its side. When that table's storage is no longer there, the
// statement addressed something that did not exist and the whole delete
// failed - leaving a column that points at a table that is gone, cannot be
// removed, and says nothing in its error about why.
export default defineBugCase({
  id: "link/delete-a-link-whose-table-is-gone",
  title: "A link to a table that is gone can still be deleted",
  runner: "orphan-link-field-delete",
  timeoutMs: 180_000,
  bug: {
    issue: "T6539",
    status: "fixed",
    sourceCommits: ["4e7f0fca1", "acb3c4677"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-orphan-link",
    hostRowTitle: "host-row",
    foreignRowTitle: "foreign-row",
    neighbourFieldName: "Notes",
  },
});
