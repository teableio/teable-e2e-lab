import { defineBugCase } from "../../framework/types";

// T6862 (with T6863, T6864): an optional link says a row may point at one of
// those, or at none - rows on the other side can be deleted and the cells
// pointing at them are cleared. Copying a base rebuilt its links without that
// instruction, so in the copy, and only in the copy, every optional link
// behaved like a required one: the delete was refused, and the message said the
// row is still referenced by a required link. There is no required link, and
// looking for one finds nothing in any table.
export default defineBugCase({
  id: "link/y901-an-optional-link-survives-being-copied",
  title: "An optional link survives being copied",
  runner: "copied-optional-link-delete",
  timeoutMs: 300_000,
  bug: {
    issue: "T6862",
    status: "fixed",
    sourceCommits: ["cfddb0057"],
  },
  config: {
    namePrefix: "e2e-lab-copied-link",
    itemsTableName: "Items",
    ordersTableName: "Orders",
    itemNames: ["linked item", "spare item"],
    orderName: "the order",
  },
});
