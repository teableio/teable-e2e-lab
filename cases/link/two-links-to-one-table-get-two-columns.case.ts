import { defineBugCase } from "../../framework/types";

// T6355: linking to the same table twice is ordinary - an assignment has a
// requester and an approver, an order has a shipping address and a billing
// address. Each link also puts a column on the other table, and the names for
// those columns were planned against the table as it stood before the request
// rather than as the request was building it, so both links were handed the
// same name.
export default defineBugCase({
  id: "link/two-links-to-one-table-get-two-columns",
  title: "Two links to the same table create two distinct columns on it",
  runner: "repeated-foreign-links",
  timeoutMs: 180_000,
  bug: {
    issue: "T6355",
    status: "fixed",
    sourceCommits: ["25ca3466c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-repeated-links",
    linkFieldNames: ["Requester", "Approver"],
  },
});
