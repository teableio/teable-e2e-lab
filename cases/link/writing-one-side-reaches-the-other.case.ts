import { defineBugCase } from "../../framework/types";

// T3531: a two-way link is one relationship shown twice - "this order contains
// these items" on one table, "this item belongs to these orders" on the other.
// Which side someone fills in is a matter of where they happen to be working.
// Writing the far side did not reach the near side: the item says it belongs
// to the order and the order does not list the item, neither side is marked
// wrong, and a count of items per order is short by exactly the ones filled in
// from the item's side.
export default defineBugCase({
  id: "link/writing-one-side-reaches-the-other",
  title: "Writing one side of a two-way link reaches the other",
  runner: "symmetric-link-write",
  timeoutMs: 180_000,
  bug: {
    issue: "T3531",
    status: "fixed",
    sourceCommits: ["384d2dad1"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-symmetric-link",
    orderTitle: "Order 1042",
    itemTitle: "Item A",
  },
});
