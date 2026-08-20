import { defineBugCase } from "../../framework/types";

// T6859: v2 ran the cross-table cleanup for a deleted table only on permanent
// delete, so trashing a table left every inbound link field still typed Link
// and pointing at a table nobody can read. The record editor rendered those
// cells blank and froze on "pick a record"; the fields turned into text only
// once someone emptied the trash. v1 degrades them the moment the table is
// trashed, and the fix restores that.
export default defineBugCase({
  id: "table/trash-degrades-inbound-link",
  title: "Trashing a table degrades the link fields pointing at it to text",
  runner: "table-trash-inbound-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T6859",
    status: "fixed",
    sourceCommits: ["68bf4bc59"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-trash-inbound-link",
    targetRowTitle: "target-row",
    hostRowTitle: "host-row",
    relationship: "manyOne",
    dropLinkDisplayColumn: false,
    settleTimeoutMs: 30_000,
    settlePollIntervalMs: 500,
  },
});
