import { defineBugCase } from "../../framework/types";

// T6911: chains like this are ordinary - amounts roll up into a highest rate,
// and another table looks that rate up. The lookup at the end carries a copy
// of the totalling rule, and a column converted back and forth can end up
// without it. From then on the tables stop working: adding a row, listing
// rows and opening the view are all refused with a message about a rule the
// user never wrote and cannot see. Each table is fine on its own; it is the
// chain that cannot be loaded.
export default defineBugCase({
  id: "record/y334-a-row-when-a-looked-up-total-lost-its-rule",
  title: "A row can be added when a looked-up total lost its rule",
  runner: "lookup-of-rollup-create",
  timeoutMs: 240_000,
  bug: {
    issue: "T6911",
    status: "fixed",
    sourceCommits: ["297a54375"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-of-rollup",
    ownerTitle: "the-owner",
    usageRowTitle: "the-usage-row",
    firstAmount: 100,
    secondAmount: 250,
  },
});
