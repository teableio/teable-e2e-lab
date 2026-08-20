import { defineBugCase } from "../../framework/types";

// T6880: the same degrade as its sibling, over a host table whose link column
// is not physically there. Converting a link field to text renamed that column
// as its first step, unconditionally - so a host whose display column was
// never provisioned failed the whole schema update, the table.update operation
// retried until it was dead, and the user kept a Link field pointing at a
// table nobody can open. The trash looked like it had worked.
export default defineBugCase({
  id: "table/trash-degrades-inbound-link-without-display-column",
  title: "Trashing a table degrades an inbound link whose column is missing",
  runner: "table-trash-inbound-link",
  timeoutMs: 180_000,
  bug: {
    issue: "T6880",
    status: "fixed",
    sourceCommits: ["16880cade"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-trash-inbound-link-no-column",
    targetRowTitle: "target-row",
    hostRowTitle: "host-row",
    // oneMany, where the reported reproduction lives: the host's link column
    // holds a JSON array of display titles, and it is that column the fixture
    // takes away.
    relationship: "oneMany",
    dropLinkDisplayColumn: true,
    settleTimeoutMs: 30_000,
    settlePollIntervalMs: 500,
  },
});
